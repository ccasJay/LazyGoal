import { createRoot } from "react-dom/client";
import { WorkspaceShell } from "./components/WorkspaceShell";
import "./style.css";
import "./workspace.css";

createRoot(document.getElementById("root")!).render(<WorkspaceShell />);
