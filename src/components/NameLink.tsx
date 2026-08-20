import { Link } from "react-router-dom";
import { normalizeName } from "../utils/normalize";

interface NameLinkProps {
  entityId: string | null;
  name: string;
}

export function NameLink({ entityId, name }: NameLinkProps) {
  if (entityId) {
    return (
      <Link
        to={`/entity/${encodeURIComponent(entityId)}`}
        className="name-link"
      >
        {name}
      </Link>
    );
  }

  // No FEC ID - link to a donor entity page by normalized name
  const donorId = `name:${normalizeName(name)}`;
  return (
    <Link
      to={`/entity/${encodeURIComponent(donorId)}`}
      className="name-link"
    >
      {name}
    </Link>
  );
}
