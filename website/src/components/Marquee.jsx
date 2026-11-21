export default function Marquee({ phrases }) {
  const row = [...phrases, ...phrases];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        {row.map((phrase, index) => (
          <span key={`${phrase}-${index}`}>{phrase}</span>
        ))}
      </div>
    </div>
  );
}
