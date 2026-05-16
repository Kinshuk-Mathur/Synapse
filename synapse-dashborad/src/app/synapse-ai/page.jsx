import ProtectedRoute from "../../components/ProtectedRoute";
import SynapseAIWorkspace from "../../components/synapse-ai/SynapseAIWorkspace";

export const metadata = {
  title: "SYNAPSE AI | Study Assistant",
  description: "A futuristic AI study and productivity assistant for SYNAPSE students."
};

export default function SynapseAIPage() {
  return (
    <ProtectedRoute>
      <SynapseAIWorkspace />
    </ProtectedRoute>
  );
}
