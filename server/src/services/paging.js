const MAX_PAGE_SIZE = 100;

/** Clamp untrusted paging/sort input so a client can never ask for the whole collection. */
export function parseListQuery(query = {}, { sortable = [], defaultSort = { createdAt: -1 }, defaultPageSize = 12 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.pageSize, 10) || defaultPageSize;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));

  const key = sortable.includes(String(query.sort)) ? String(query.sort) : null;
  const direction = String(query.direction) === 'asc' ? 1 : -1;
  const sortSpec = key ? { [key]: direction } : defaultSort;

  return { page, pageSize, skip: (page - 1) * pageSize, sortSpec, sortKey: key, direction };
}

/** Escape user input before it becomes a regular expression. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchRegex(value) {
  const term = String(value || '').trim();
  return term ? new RegExp(escapeRegex(term), 'i') : null;
}

export function paged(payload, { page, pageSize, total, counts }) {
  return {
    data: payload,
    meta: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      ...(counts ? { counts } : {}),
    },
  };
}
