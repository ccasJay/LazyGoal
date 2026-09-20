"""Adversarial stress and mutation verification harness for GEPA RunOwnership.

This script executes real multi-process stress tests to empirically verify:
1. Pure mutual exclusion during simultaneous cold-start rush acquires.
2. 100% rejection with exact active PID during lock-holding periods.
3. Clean orphan lock takeover after SIGKILL crash termination.
4. High-frequency heartbeat integrity under concurrent reads and theft attempts.
5. Self-healing takeover when owner.json is corrupted by an abnormal termination.
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import signal
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Ensure lazygoal_gepa is importable
repo_root = Path(__file__).resolve().parents[2]
src_dir = repo_root / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from lazygoal_gepa.errors import (
    RunOwnershipError,
    RunStoreError,
    WorkerAlreadyRunningError,
)
from lazygoal_gepa.ownership import (
    OwnerInfo,
    RunOwnership,
    is_pid_alive,
)


# Worker entrypoints for multiprocessing (must be top-level for 'spawn' method)

def _worker_rush_acquire(
    run_dir: str,
    worker_id: int,
    barrier: Any,
    result_queue: Any,
    hold_seconds: float = 0.5,
) -> None:
    """Worker process participating in simultaneous rush acquire."""
    ownership = RunOwnership(run_dir)
    my_pid = os.getpid()
    
    # Synchronize all processes at the starting line
    barrier.wait()
    
    start_t = time.perf_counter()
    acquired = False
    error_type: str | None = None
    reported_pid: int | None = None
    
    try:
        owner = ownership.acquire(f"worker-{worker_id}")
        acquired = True
        elapsed = time.perf_counter() - start_t
        result_queue.put({
            "worker_id": worker_id,
            "pid": my_pid,
            "acquired": True,
            "error": None,
            "reported_pid": None,
            "elapsed_ms": elapsed * 1000,
        })
        # Hold lock to allow losers to probe
        time.sleep(hold_seconds)
    except WorkerAlreadyRunningError as e:
        elapsed = time.perf_counter() - start_t
        result_queue.put({
            "worker_id": worker_id,
            "pid": my_pid,
            "acquired": False,
            "error": "WorkerAlreadyRunningError",
            "reported_pid": e.pid,
            "elapsed_ms": elapsed * 1000,
        })
    except Exception as e:
        elapsed = time.perf_counter() - start_t
        result_queue.put({
            "worker_id": worker_id,
            "pid": my_pid,
            "acquired": False,
            "error": type(e).__name__,
            "reported_pid": None,
            "elapsed_ms": elapsed * 1000,
        })
    finally:
        if acquired:
            ownership.release()


def _worker_hold_and_heartbeat(
    run_dir: str,
    ready_event: Any,
    stop_event: Any,
    result_queue: Any,
    heartbeat_interval: float = 0.01,
) -> None:
    """Worker holding ownership and continuously beating heart."""
    ownership = RunOwnership(run_dir)
    try:
        owner = ownership.acquire("heartbeat-holder")
        ready_event.set()
        
        heartbeat_count = 0
        while not stop_event.is_set():
            time.sleep(heartbeat_interval)
            ownership.update_heartbeat()
            heartbeat_count += 1
            
        result_queue.put({
            "success": True,
            "pid": os.getpid(),
            "heartbeat_count": heartbeat_count,
        })
    except Exception as e:
        result_queue.put({
            "success": False,
            "error": str(e),
            "pid": os.getpid(),
        })
    finally:
        ownership.release()


def _worker_attempt_acquire(
    run_dir: str,
    worker_id: int,
    result_queue: Any,
) -> None:
    """Worker attempting to steal or acquire lock."""
    ownership = RunOwnership(run_dir)
    try:
        ownership.acquire(f"stealer-{worker_id}")
        result_queue.put({"success": True, "error": None, "pid": os.getpid()})
        ownership.release()
    except WorkerAlreadyRunningError as e:
        result_queue.put({
            "success": False,
            "error": "WorkerAlreadyRunningError",
            "reported_pid": e.pid,
            "pid": os.getpid(),
        })
    except Exception as e:
        result_queue.put({
            "success": False,
            "error": type(e).__name__,
            "reported_pid": None,
            "pid": os.getpid(),
        })


def _worker_read_and_check(
    run_dir: str,
    iterations: int,
    result_queue: Any,
) -> None:
    """Worker constantly reading owner info and checking health."""
    ownership = RunOwnership(run_dir)
    corrupted_count = 0
    read_failures = 0
    stale_count = 0
    active_count = 0
    
    for _ in range(iterations):
        health, info = ownership.check_health(stale_threshold_seconds=10.0)
        if health == "active":
            active_count += 1
        elif health == "corrupt":
            corrupted_count += 1
        elif health == "stale":
            stale_count += 1
            
        info2 = ownership._safe_read_owner_info()
        if info2 is None:
            read_failures += 1
        time.sleep(0.002)
        
    result_queue.put({
        "iterations": iterations,
        "active_count": active_count,
        "corrupted_count": corrupted_count,
        "stale_count": stale_count,
        "read_failures": read_failures,
    })


def _worker_for_crash(
    run_dir: str,
    ready_event: Any,
) -> None:
    """Worker that acquires ownership and waits to be killed with SIGKILL."""
    ownership = RunOwnership(run_dir)
    ownership.acquire("doomed-worker")
    ready_event.set()
    # Hang indefinitely until SIGKILL
    while True:
        time.sleep(1.0)


# Test Suite Implementation

class RunOwnershipStressTester:
    def __init__(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name).resolve()
        self.report_data: dict[str, Any] = {}

    def cleanup(self) -> None:
        self.temp_dir.cleanup()

    def run_all(self) -> bool:
        print("=" * 70)
        print("STARTING EMPIRICAL CONCURRENCY & STRESS VERIFICATION FOR RunOwnership")
        print(f"Platform: {sys.platform}, Python: {sys.version.split()[0]}")
        print(f"MP Context Start Method: {mp.get_start_method()}")
        print("=" * 70)
        
        all_passed = True
        try:
            p1_pass = self.test_phase1_concurrent_rush_acquire(num_processes=20)
            all_passed = all_passed and p1_pass
            
            p2_pass = self.test_phase2_holding_period_rejection(num_probers=20)
            all_passed = all_passed and p2_pass
            
            p3_pass = self.test_phase3_orphan_lock_crash_takeover()
            all_passed = all_passed and p3_pass
            
            p3b_pass = self.test_phase3b_multi_generation_crash_recovery(generations=4)
            all_passed = all_passed and p3b_pass
            
            p4_pass = self.test_phase4_heartbeat_stress_and_concurrent_probing()
            all_passed = all_passed and p4_pass
            
            p4b_pass = self.test_phase4b_multi_round_churn_stress(rounds=5, contestants_per_round=8)
            all_passed = all_passed and p4b_pass
            
            p5_pass = self.test_phase5_corrupted_lock_recovery()
            all_passed = all_passed and p5_pass
            
        finally:
            self.cleanup()
            
        print("=" * 70)
        if all_passed:
            print("ALL EMPIRICAL STRESS TESTS PASSED SUCCESSFULLY! (100% MUTUAL EXCLUSION)")
        else:
            print("SOME STRESS TESTS FAILED! CHECK OUTPUT DETAILS.")
        print("=" * 70)
        return all_passed

    def test_phase1_concurrent_rush_acquire(self, num_processes: int = 10) -> bool:
        print(f"\n[Phase 1] Cold-Start Rush Acquire Contest ({num_processes} concurrent processes)")
        run_dir = str(self.base_dir / "phase1_rush")
        barrier = mp.Barrier(num_processes)
        result_queue = mp.Queue()
        
        processes = [
            mp.Process(
                target=_worker_rush_acquire,
                args=(run_dir, i, barrier, result_queue, 0.8),
            )
            for i in range(num_processes)
        ]
        
        for p in processes:
            p.start()
            
        for p in processes:
            p.join(timeout=10)
            
        results = []
        while not result_queue.empty():
            results.append(result_queue.get())
            
        successes = [r for r in results if r["acquired"]]
        failures = [r for r in results if not r["acquired"]]
        
        print(f"  Total contestants: {num_processes}")
        print(f"  Acquired count: {len(successes)} (Expect: exactly 1)")
        print(f"  Rejected count: {len(failures)} (Expect: exactly {num_processes - 1})")
        
        passed = True
        if len(successes) != 1:
            print(f"  ❌ FAILED: Multiple winners or no winner! Got {len(successes)}")
            passed = False
        else:
            winner = successes[0]
            print(f"  ✓ Winner PID: {winner['pid']}, latency: {winner['elapsed_ms']:.2f}ms")
            
        # Check failures
        for f in failures:
            if f["error"] != "WorkerAlreadyRunningError":
                print(f"  ❌ FAILED: Unexpected error: {f['error']}")
                passed = False
                
        # Inspect reported PIDs
        if passed and len(successes) == 1:
            winner_pid = successes[0]["pid"]
            matched_pid_count = sum(1 for f in failures if f["reported_pid"] == winner_pid)
            none_pid_count = sum(1 for f in failures if f["reported_pid"] is None)
            print(f"  Failures reporting winner PID: {matched_pid_count}/{len(failures)}")
            if none_pid_count > 0:
                print(f"  ℹ️  Microsecond race note: {none_pid_count} failures caught lock before owner.json was flushed")
                
        self.report_data["phase1"] = {
            "num_processes": num_processes,
            "acquired": len(successes),
            "rejected": len(failures),
            "all_errors_valid": all(f["error"] == "WorkerAlreadyRunningError" for f in failures),
            "passed": passed,
        }
        return passed

    def test_phase2_holding_period_rejection(self, num_probers: int = 15) -> bool:
        print(f"\n[Phase 2] Lock-Holding Rejection ({num_probers} subsequent probes)")
        run_dir = str(self.base_dir / "phase2_holding")
        
        ownership = RunOwnership(run_dir)
        owner = ownership.acquire("stable-holder")
        holder_pid = owner.pid
        print(f"  Holder acquired lock (PID {holder_pid})")
        
        result_queue = mp.Queue()
        processes = [
            mp.Process(target=_worker_attempt_acquire, args=(run_dir, i, result_queue))
            for i in range(num_probers)
        ]
        
        for p in processes:
            p.start()
        for p in processes:
            p.join(timeout=5)
            
        results = []
        while not result_queue.empty():
            results.append(result_queue.get())
            
        stolen = [r for r in results if r["success"]]
        rejected = [r for r in results if not r["success"]]
        matched_pid = [r for r in rejected if r.get("reported_pid") == holder_pid]
        
        print(f"  Probers: {num_probers}")
        print(f"  Theft success count: {len(stolen)} (Expect: 0)")
        print(f"  Rejection count: {len(rejected)} (Expect: {num_probers})")
        print(f"  Rejections reporting exact active PID: {len(matched_pid)}/{num_probers}")
        
        passed = len(stolen) == 0 and len(rejected) == num_probers and len(matched_pid) == num_probers
        ownership.release()
        
        if passed:
            print("  ✓ PASSED: 100% rejection with 100% exact PID detection during lock hold")
        else:
            print("  ❌ FAILED holding period rejection!")
            
        self.report_data["phase2"] = {
            "num_probers": num_probers,
            "stolen": len(stolen),
            "rejected": len(rejected),
            "matched_pid_rate": len(matched_pid) / num_probers if num_probers else 0,
            "passed": passed,
        }
        return passed

    def test_phase3_orphan_lock_crash_takeover(self) -> bool:
        print("\n[Phase 3] Orphan Lock Safe Takeover (SIGKILL crash recovery)")
        run_dir = str(self.base_dir / "phase3_orphan")
        ready_event = mp.Event()
        
        victim = mp.Process(target=_worker_for_crash, args=(run_dir, ready_event))
        victim.start()
        ready_event.wait(timeout=5)
        victim_pid = victim.pid
        print(f"  Doomed worker running with PID {victim_pid}")
        
        ownership = RunOwnership(run_dir)
        health_before, info_before = ownership.check_health()
        assert health_before == "active"
        assert info_before is not None and info_before.pid == victim_pid
        print("  Health verified as 'active' before crash")
        
        # Violently kill victim with SIGKILL (no cleanup possible)
        print("  Sending SIGKILL to doomed worker...")
        os.kill(victim_pid, signal.SIGKILL)
        victim.join(timeout=5)
        
        # Verify OS recognized death
        alive_check = is_pid_alive(victim_pid)
        print(f"  is_pid_alive({victim_pid}) -> {alive_check} (Expect: False)")
        assert not alive_check
        
        # Check health: must report "lost"
        health_after, info_after = ownership.check_health()
        print(f"  check_health() after crash -> {health_after} (Expect: 'lost')")
        passed = (health_after == "lost" and info_after is not None and info_after.pid == victim_pid)
        
        # Now launch 5 concurrent processes to race for orphan lock takeover!
        print("  Racing 5 new contestants to take over orphan lock...")
        barrier = mp.Barrier(5)
        result_queue = mp.Queue()
        contestants = [
            mp.Process(
                target=_worker_rush_acquire,
                args=(run_dir, i, barrier, result_queue, 0.2),
            )
            for i in range(5)
        ]
        for p in contestants:
            p.start()
        for p in contestants:
            p.join(timeout=5)
            
        takeover_results = []
        while not result_queue.empty():
            takeover_results.append(result_queue.get())
            
        takeover_successes = [r for r in takeover_results if r["acquired"]]
        takeover_failures = [r for r in takeover_results if not r["acquired"]]
        
        print(f"  Takeover winner count: {len(takeover_successes)} (Expect: exactly 1)")
        print(f"  Takeover rejected count: {len(takeover_failures)} (Expect: exactly 4)")
        
        if len(takeover_successes) != 1 or len(takeover_failures) != 4:
            print("  ❌ FAILED orphan takeover contest!")
            passed = False
        else:
            new_winner = takeover_successes[0]
            print(f"  ✓ Orphan lock safely recovered by PID {new_winner['pid']}")
            
        self.report_data["phase3"] = {
            "victim_pid": victim_pid,
            "detected_as_lost": health_after == "lost",
            "takeover_winners": len(takeover_successes),
            "takeover_failures": len(takeover_failures),
            "passed": passed,
        }
        return passed

    def test_phase3b_multi_generation_crash_recovery(self, generations: int = 4) -> bool:
        print(f"\n[Phase 3B] Multi-Generation Crash Recovery ({generations} consecutive SIGKILLs)")
        run_dir = str(self.base_dir / "phase3b_gen_crash")
        ownership = RunOwnership(run_dir)
        passed = True
        
        for gen in range(1, generations + 1):
            ready_event = mp.Event()
            victim = mp.Process(target=_worker_for_crash, args=(run_dir, ready_event))
            victim.start()
            ready_event.wait(timeout=5)
            victim_pid = victim.pid
            
            # Verify active
            health, info = ownership.check_health()
            if health != "active" or info is None or info.pid != victim_pid:
                print(f"  ❌ Generation {gen} failed active health verification")
                passed = False
                break
                
            # Crash victim
            os.kill(victim_pid, signal.SIGKILL)
            victim.join(timeout=5)
            
            # Verify lost
            health_lost, info_lost = ownership.check_health()
            if health_lost != "lost" or info_lost is None or info_lost.pid != victim_pid:
                print(f"  ❌ Generation {gen} failed lost health verification after SIGKILL")
                passed = False
                break
            print(f"  Generation {gen} (PID {victim_pid}) crashed -> health correctly diagnosed as 'lost'")
            
        # Final survivor takes over cleanly
        survivor = ownership.acquire("survivor-worker")
        health_survivor, _ = ownership.check_health()
        if health_survivor != "active" or survivor.pid != os.getpid():
            print("  ❌ Survivor failed takeover")
            passed = False
        else:
            print(f"  ✓ Final survivor safely acquired orphan lock (PID {survivor.pid})")
            
        ownership.release()
        self.report_data["phase3b"] = {
            "generations": generations,
            "passed": passed,
        }
        return passed

    def test_phase4_heartbeat_stress_and_concurrent_probing(self) -> bool:
        print("\n[Phase 4] High-Frequency Heartbeat Stress & Concurrent Probing")
        run_dir = str(self.base_dir / "phase4_heartbeat")
        ready_event = mp.Event()
        stop_event = mp.Event()
        holder_queue = mp.Queue()
        
        # Start holder doing 10ms heartbeats
        holder = mp.Process(
            target=_worker_hold_and_heartbeat,
            args=(run_dir, ready_event, stop_event, holder_queue, 0.01),
        )
        holder.start()
        ready_event.wait(timeout=5)
        holder_pid = holder.pid
        print(f"  Heartbeat holder active (PID {holder_pid}, interval 10ms)")
        
        # Concurrent theft attempters (30 attempts)
        steal_queue = mp.Queue()
        num_steal_attempts = 20
        stealers = [
            mp.Process(target=_worker_attempt_acquire, args=(run_dir, i, steal_queue))
            for i in range(num_steal_attempts)
        ]
        
        # Concurrent readers (2 readers, 50 reads each)
        reader_queue = mp.Queue()
        num_readers = 2
        readers = [
            mp.Process(target=_worker_read_and_check, args=(run_dir, 50, reader_queue))
            for _ in range(num_readers)
        ]
        
        # Start all concurrent probers and readers simultaneously
        for p in stealers + readers:
            p.start()
            
        for p in stealers + readers:
            p.join(timeout=10)
            
        # Stop heartbeater
        time.sleep(0.1)
        stop_event.set()
        holder.join(timeout=5)
        
        holder_res = holder_queue.get() if not holder_queue.empty() else {}
        heartbeat_count = holder_res.get("heartbeat_count", 0)
        print(f"  Completed heartbeats: {heartbeat_count}")
        
        steal_results = []
        while not steal_queue.empty():
            steal_results.append(steal_queue.get())
        stolen = [r for r in steal_results if r["success"]]
        rejected = [r for r in steal_results if not r["success"]]
        
        reader_results = []
        while not reader_queue.empty():
            reader_results.append(reader_queue.get())
            
        total_corrupted = sum(r["corrupted_count"] for r in reader_results)
        total_read_failures = sum(r["read_failures"] for r in reader_results)
        total_active_reads = sum(r["active_count"] for r in reader_results)
        
        print(f"  Steal attempts: {len(steal_results)}, Stolen: {len(stolen)} (Expect: 0)")
        print(f"  Total concurrent reads: {total_active_reads + total_corrupted + total_read_failures}")
        print(f"  Active status reads: {total_active_reads}")
        print(f"  Corrupted reads: {total_corrupted} (Expect: 0)")
        print(f"  Read failures: {total_read_failures} (Expect: 0)")
        
        passed = (
            len(stolen) == 0
            and len(rejected) == num_steal_attempts
            and total_corrupted == 0
            and total_read_failures == 0
            and heartbeat_count > 10
        )
        
        if passed:
            print("  ✓ PASSED: Heartbeat atomic updates preserved 100% lock integrity and clean reads")
        else:
            print("  ❌ FAILED heartbeat stress test!")
            
        self.report_data["phase4"] = {
            "heartbeat_count": heartbeat_count,
            "steal_attempts": len(steal_results),
            "stolen_count": len(stolen),
            "total_reads": total_active_reads + total_corrupted + total_read_failures,
            "corrupted_reads": total_corrupted,
            "passed": passed,
        }
        return passed

    def test_phase4b_multi_round_churn_stress(
        self, rounds: int = 5, contestants_per_round: int = 8
    ) -> bool:
        print(f"\n[Phase 4B] Multi-Round Churn & Release Competition ({rounds} rounds, {contestants_per_round} procs/round)")
        run_dir = str(self.base_dir / "phase4b_churn")
        all_rounds_passed = True
        
        for r in range(1, rounds + 1):
            barrier = mp.Barrier(contestants_per_round)
            result_queue = mp.Queue()
            processes = [
                mp.Process(
                    target=_worker_rush_acquire,
                    args=(run_dir, i, barrier, result_queue, 0.05),
                )
                for i in range(contestants_per_round)
            ]
            for p in processes:
                p.start()
            for p in processes:
                p.join(timeout=5)
                
            results = []
            while not result_queue.empty():
                results.append(result_queue.get())
                
            successes = [res for res in results if res["acquired"]]
            failures = [res for res in results if not res["acquired"]]
            
            round_passed = (
                len(successes) == 1
                and len(failures) == contestants_per_round - 1
                and all(f["error"] == "WorkerAlreadyRunningError" for f in failures)
            )
            
            if not round_passed:
                print(f"  ❌ Round {r} failed: {len(successes)} winners, {len(failures)} failures")
                all_rounds_passed = False
                break
            else:
                print(f"  Round {r}: Winner PID {successes[0]['pid']} successfully acquired and released; {len(failures)} rejected cleanly")
                
            # Allow clean unlinking
            time.sleep(0.02)
            
        if all_rounds_passed:
            print(f"  ✓ PASSED: All {rounds} churn rounds maintained 100% mutual exclusion with 0 deadlocks")
            
        self.report_data["phase4b"] = {
            "rounds": rounds,
            "contestants_per_round": contestants_per_round,
            "passed": all_rounds_passed,
        }
        return all_rounds_passed

    def test_phase5_corrupted_lock_recovery(self) -> bool:
        print("\n[Phase 5] Corrupted owner.json Self-Healing Takeover")
        run_dir = Path(self.base_dir / "phase5_corrupt")
        run_dir.mkdir(parents=True, exist_ok=True)
        
        # Write corrupted partial JSON
        owner_file = run_dir / "owner.json"
        owner_file.write_text('{"pid": 1234, "workerToken": "incomp', encoding="utf-8")
        
        ownership = RunOwnership(run_dir)
        health, info = ownership.check_health()
        print(f"  check_health() on truncated JSON -> {health} (Expect: 'corrupt')")
        
        passed = health == "corrupt" and info is None
        
        # Acquire should self-heal and overwrite corrupted owner.json
        recovered = ownership.acquire("healer-token")
        print(f"  Recovered acquire PID: {recovered.pid}")
        
        health_after, info_after = ownership.check_health()
        print(f"  check_health() after recovery -> {health_after} (Expect: 'active')")
        
        passed = passed and (health_after == "active") and (info_after is not None) and (info_after.pid == os.getpid())
        ownership.release()
        
        if passed:
            print("  ✓ PASSED: Corrupted owner.json safely detected and recovered")
        else:
            print("  ❌ FAILED corrupted lock recovery test!")
            
        self.report_data["phase5"] = {
            "detected_as_corrupt": health == "corrupt",
            "healed_to_active": health_after == "active",
            "passed": passed,
        }
        return passed


if __name__ == "__main__":
    tester = RunOwnershipStressTester()
    success = tester.run_all()
    # Output JSON summary at the end for machine consumption
    print("\n--- JSON_SUMMARY_START ---")
    print(json.dumps(tester.report_data, indent=2))
    print("--- JSON_SUMMARY_END ---")
    sys.exit(0 if success else 1)
