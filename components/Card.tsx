import { SUIT_SYMBOL, rankOf, suitOf } from "@/lib/engine/cards";

export function CardFace({ card, className = "" }: { card: string; className?: string }) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const red = suit === "H" || suit === "D";
  const sym = SUIT_SYMBOL[suit];
  return (
    <div className={`card ${red ? "red" : ""} ${className}`} aria-label={`${rank} of ${suit}`}>
      <div className="corner">
        {rank}
        <small>{sym}</small>
      </div>
      <div className="pip">{sym}</div>
      <div className="corner bottom">
        {rank}
        <small>{sym}</small>
      </div>
    </div>
  );
}

export function CardBack({ className = "" }: { className?: string }) {
  return <div className={`card back ${className}`} />;
}
