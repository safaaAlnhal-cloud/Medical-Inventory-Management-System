// IDs are opaque: the backend may use numbers, strings or UUIDs (see BACKEND_HANDOFF.md).
// The UI never converts an id to another type. A <select> can only hold strings, so its value
// is matched back to the record it came from and that record's own id is used.

export const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Returns the id of the row a <select> value points to, exactly as the data source sent it,
// or undefined when no row matches.
export const resolveId = (rows, value) => rows.find((row) => sameId(row.id, value))?.id;
