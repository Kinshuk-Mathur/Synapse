import ProtectedRoute from "../../components/ProtectedRoute";
import TodoWorkspace from "../../components/todo/TodoWorkspace";

export const metadata = {
  title: "SYNAPSE | To Do List",
  description: "Calendar based AI productivity task management for SYNAPSE students."
};

export default function TodoPage() {
  return (
    <ProtectedRoute>
      <TodoWorkspace />
    </ProtectedRoute>
  );
}
