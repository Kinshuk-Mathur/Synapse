import AnalyticsWorkspace from "../../components/analytics/AnalyticsWorkspace";
import ProtectedRoute from "../../components/ProtectedRoute";

export const metadata = {
  title: "SYNAPSE | Analytics",
  description: "Realtime AI productivity analytics for SYNAPSE students."
};

export default function AnalyticsPage() {
  return (
    <ProtectedRoute>
      <AnalyticsWorkspace />
    </ProtectedRoute>
  );
}
