import { Navigate } from "react-router-dom";

/**
 * Placeholder for a dedicated results page.
 * For now, redirects to the main simulation page since results
 * are displayed inline.
 */
export default function ResultsPage() {
  return <Navigate to="/" replace />;
}
