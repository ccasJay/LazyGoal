import { connect } from "node:net";
const port = Number(process.argv[2]);
const payload = process.env.TRIGGER_TEST_REQUEST;
if (!Number.isInteger(port) || payload === undefined) throw new Error("request is required");
const socket = connect(port, "127.0.0.1", () => socket.end(payload));
socket.setEncoding("utf8");
socket.on("data", (chunk) => process.stdout.write(chunk));
socket.on("error", (error) => { process.stderr.write(error.message); process.exitCode = 1; });
