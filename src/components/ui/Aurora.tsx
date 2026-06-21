/**
 * Aurora — the soft mesh backdrop the glass refracts over.
 * Place inside a positioned ancestor; it fills `inset: 0`.
 */
export function Aurora({ dim = false }: { dim?: boolean }) {
  return (
    <div className={"aurora" + (dim ? " dim" : "")} aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="blob b4" />
      <div className="grain" />
    </div>
  );
}
