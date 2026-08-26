import unittest

from sidecar import (
    _goal_condition_success_rate,
    _observation_text,
    _unpack_reset_result,
    _unpack_step_result,
)


class SidecarTextWorldCompatibilityTest(unittest.TestCase):
    def test_current_game_state_reset_result(self):
        state = {
            "feedback": "initial observation",
            "admissible_commands": ["look"],
            "won": False,
        }

        observation, infos = _unpack_reset_result(state)

        self.assertIs(observation, state)
        self.assertIs(infos, state)
        self.assertEqual(_observation_text(observation), "initial observation")

    def test_current_game_state_step_result(self):
        state = {
            "feedback": "won observation",
            "admissible_commands": [],
            "won": True,
        }

        observation, score, done, infos = _unpack_step_result((state, 1, True))

        self.assertIs(observation, state)
        self.assertEqual(score, 1)
        self.assertTrue(done)
        self.assertIs(infos, state)
        self.assertEqual(_observation_text(observation), "won observation")

    def test_legacy_reset_and_step_shapes_remain_supported(self):
        observation, infos = _unpack_reset_result(("legacy observation", {"won": False}))
        self.assertEqual(observation, "legacy observation")
        self.assertEqual(infos, {"won": False})

        result = _unpack_step_result(("legacy observation", 0, False, {"won": False}))
        self.assertEqual(result, ("legacy observation", 0, False, {"won": False}))

    def test_textworld_without_partial_rate_uses_binary_win_rate(self):
        self.assertEqual(_goal_condition_success_rate({"won": True}), 1.0)
        self.assertEqual(_goal_condition_success_rate({"won": False}), 0.0)
        self.assertEqual(
            _goal_condition_success_rate({"won": False, "goal_condition_success_rate": 0.5}),
            0.5,
        )


if __name__ == "__main__":
    unittest.main()
