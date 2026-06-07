export function filterServices(services, { query, status, sort, sortOrder = 'desc' }) {
  let result = [...services];

  if (query) {
    const q = query.toLowerCase();
    result = result.filter(
      (s) =>
        s.serviceNumber.includes(q) ||
        (s.label || '').toLowerCase().includes(q) ||
        (s.customerName || '').toLowerCase().includes(q)
    );
  }

  if (status) {
    result = result.filter((s) => s.lastStatus === status);
  }

  function compareBySort(a, b) {
    const isAsc = sortOrder === 'asc';
    switch (sort) {
      case 'amount': {
        const diff = (a.lastAmountDue || 0) - (b.lastAmountDue || 0);
        return isAsc ? diff : -diff;
      }
      case 'dueDate': {
        const da = a.lastDueDate ? new Date(a.lastDueDate).getTime() : Infinity;
        const db2 = b.lastDueDate ? new Date(b.lastDueDate).getTime() : Infinity;
        const diff = da - db2;
        return isAsc ? diff : -diff;
      }
      case 'name': {
        const nameA = a.label || a.customerName || a.serviceNumber;
        const nameB = b.label || b.customerName || b.serviceNumber;
        const diff = nameA.localeCompare(nameB);
        return isAsc ? diff : -diff;
      }
      default:
        return 0;
    }
  }

  result.sort((a, b) => {
    if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return compareBySort(a, b);
  });

  return result;
}
