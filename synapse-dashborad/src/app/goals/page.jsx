import ProtectedRoute from "../../components/ProtectedRoute";
import GoalsWorkspace from "../../components/synapse-goals/GoalsWorkspace";

export const metadata = {
  title: "SYNAPSE | Monthly Goals",
  description: "Premium monthly goal tracking workspace for SYNAPSE students."
};

export default function GoalsPage() {
  return (
    <ProtectedRoute>
      <GoalsWorkspace />
    </ProtectedRoute>
  );
}
