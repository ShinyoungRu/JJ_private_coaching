import { useSearchParams } from "react-router";
import { PublicBook } from "../components/PublicBook";

/** Iframe-friendly booking preview for www.jjprivatetraining.com (no header/footer). */
export default function EmbedBook() {
  const [params] = useSearchParams();
  return (
    <div className="min-h-screen bg-ink p-4 sm:p-6">
      <PublicBook initialType={params.get("type")} embed />
      <p className="mt-6 text-center text-sm">
        <a href="/book" target="_blank" rel="noopener" className="font-semibold text-brand hover:underline">Open the full booking calendar →</a>
      </p>
    </div>
  );
}
