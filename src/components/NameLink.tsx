import { Link } from "react-router-dom";

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

  // No entity ID - link to search for this name
  return (
    <Link
      to={`/?q=${encodeURIComponent(name)}`}
      className="name-link"
    >
      {name}
    </Link>
  );
}
