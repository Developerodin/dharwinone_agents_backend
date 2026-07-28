import "./jack.css";
import { JackPortfolio } from "./JackPortfolio";

export function JackPortfolioShell() {
  return (
    <div className="jack-portfolio min-h-screen" style={{ background: "#0C0C0C" }}>
      <JackPortfolio />
    </div>
  );
}
