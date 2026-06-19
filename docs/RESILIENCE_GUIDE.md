# Graceful Degradation & Resilience Implementation Guide

This guide explains how to implement graceful degradation patterns in AP Vidyuth following the standards defined in [docs/STANDARDS.md](STANDARDS.md) sections 9.1-9.13.

---

## Quick Start

### 1. **Use Error Boundaries to Catch React Render Errors**

```jsx
import { ErrorBoundary } from '@shared/components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary context="ElectricityDashboard">
      <ElectricityDashboard />
    </ErrorBoundary>
  );
}
```

### 2. **Use `useAsyncOperation` for Data Fetching**

```jsx
import { useAsyncOperation } from '@shared/hooks/useAsyncOperation';
import { ErrorState } from '@shared/components/ErrorState';
import { EmptyState } from '@shared/components/EmptyState';
import { Loader } from '@shared/components/Loader';

function BillsList() {
  const { data: bills, error, loading, retry } = useAsyncOperation(
    () => fetch('/api/bills').then(r => r.json()),
    { context: '[BillsList]' }
  );

  if (loading) return <Loader />;
  if (error) return <ErrorState message="Unable to load bills" onRetry={retry} />;
  if (!bills?.length) return <EmptyState title="No bills" message="No bills yet" />;

  return <BillsTable bills={bills} />;
}
```

### 3. **Use Error State for Manual Fetch Operations**

```jsx
import { useLazyAsyncOperation } from '@shared/hooks/useAsyncOperation';
import { ErrorState } from '@shared/components/ErrorState';

function AddServiceForm() {
  const { execute, loading, error } = useLazyAsyncOperation(
    () => actions.add(formData),
    { context: '[AddServiceForm]' }
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); execute(); }}>
      {error && <ErrorState message={error.message} onRetry={execute} />}
      {loading && <Loader />}
      {/* form fields */}
      <button disabled={loading}>Add Service</button>
    </form>
  );
}
```

---

## Comprehensive Patterns

### Pattern 1: Widget with Independent Error Handling

```jsx
// ✅ Good - Each widget manages its own state
function BudgetWidget() {
  const { data, error, loading, retry } = useAsyncOperation(
    () => fetchBudget(),
    { context: '[BudgetWidget]' }
  );

  return (
    <div className="widget">
      {loading && <SkeletonLoader />}
      {error && <ErrorState onRetry={retry} compact />}
      {data && <BudgetDisplay budget={data} />}
    </div>
  );
}

function Dashboard() {
  return (
    <div className="dashboard">
      <BudgetWidget /> {/* Fails independently */}
      <PaymentWidget /> {/* Continues working */}
      <HistoryWidget /> {/* Continues working */}
    </div>
  );
}
```

### Pattern 2: Form with State Preservation

```jsx
function ServiceDialog() {
  // Load draft from localStorage if available
  const [formData, setFormData] = useState(() => 
    localStorage.getItem('draft-service')
      ? JSON.parse(localStorage.getItem('draft-service'))
      : { serviceNumber: '', label: '' }
  );

  const { execute, loading, error } = useLazyAsyncOperation(
    () => actions.add(formData),
    { context: '[ServiceDialog]' }
  );

  // Save draft on every change
  useEffect(() => {
    localStorage.setItem('draft-service', JSON.stringify(formData));
  }, [formData]);

  const handleSubmit = async () => {
    try {
      await execute();
      // Only clear draft on success
      localStorage.removeItem('draft-service');
      toast.success('Service added!');
      close();
    } catch (e) {
      // Draft is preserved, user can retry
    }
  };

  return (
    <div className="dialog">
      {error && <ErrorState message={error.message} onRetry={handleSubmit} />}
      
      <input 
        value={formData.serviceNumber}
        onChange={(e) => setFormData({...formData, serviceNumber: e.target.value})}
        placeholder="Service number"
      />
      
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Adding...' : 'Add Service'}
      </button>
    </div>
  );
}
```

### Pattern 3: Offline-First with Cached Data

```jsx
import { useAsyncOperationWithCache } from '@shared/hooks/useAsyncOperation';
import { useNetwork } from '@shared/hooks/useNetwork';

function BillsTab() {
  const { isOffline } = useNetwork();
  const { data: bills, loading, error, retry } = useAsyncOperationWithCache(
    () => fetchBills(),
    { 
      cacheKey: 'bills-list',
      cacheTime: 10 * 60 * 1000 // Cache for 10 minutes
    }
  );

  if (loading && !bills?.length) return <Loader />;
  if (error && !bills?.length) return <ErrorState onRetry={retry} />;
  
  return (
    <div>
      {isOffline && <InfoBanner message="You're offline. Showing cached data." />}
      {bills?.length === 0 ? (
        <EmptyState title="No bills" />
      ) : (
        <BillsList bills={bills} />
      )}
    </div>
  );
}
```

### Pattern 4: Retry with Exponential Backoff

```jsx
import { retryWithBackoff } from '@shared/utils/errorHandling';

async function fetchWithRetry(serviceId) {
  try {
    return await retryWithBackoff(
      () => fetch(`/api/bills/${serviceId}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      maxRetries = 3,
      retryDelays = [0, 2000, 5000] // Exponential backoff
    );
  } catch (error) {
    logError('[fetchWithRetry]', 'All retry attempts failed', error, { serviceId });
    throw error;
  }
}
```

### Pattern 5: Logging for Debugging

```jsx
import { logError, getErrorMessage } from '@shared/utils/errorHandling';

async function refreshBill(serviceId) {
  try {
    await fetch(`/api/refresh/${serviceId}`).then(r => r.json());
  } catch (error) {
    // Log with context
    logError(
      '[ElectricityDashboard]',
      'Bill refresh failed',
      error,
      {
        serviceId,
        timestamp: new Date().toISOString(),
        action: 'pull-to-refresh'
      }
    );

    // Show user-friendly message
    const userMessage = getErrorMessage(error, 'Unable to refresh. Please try again.');
    toast.error(userMessage);
  }
}
```

---

## Component Reference

### ErrorBoundary

Catches React render errors and displays fallback UI.

```jsx
<ErrorBoundary 
  context="FeatureName"
  onError={(error, errorInfo) => console.log(errorInfo)}
>
  <YourComponent />
</ErrorBoundary>
```

**Props:**
- `context` - Where error occurred (for logging)
- `onError` - Callback when error caught
- `fallback` - Custom error UI (optional)
- `children` - Component to protect

### ErrorState

Display when data fetch fails.

```jsx
<ErrorState
  message="Unable to load your bills"
  title="Error"
  onRetry={handleRetry}
  icon={CustomIcon}
  compact={false}
/>
```

**Props:**
- `message` - Error description
- `title` - Error title (hidden in compact mode)
- `onRetry` - Retry button callback
- `icon` - Custom icon component
- `compact` - Smaller version for inline errors

### EmptyState

Display when no data available.

```jsx
<EmptyState
  icon="⚡"
  title="No services yet"
  message="Add your first electricity service to get started"
  cta={{ 
    label: 'Add Service',
    onClick: () => openDialog()
  }}
  compact={false}
/>
```

**Props:**
- `icon` - Emoji or component
- `title` - Empty title (hidden in compact mode)
- `message` - Explanation of why empty
- `cta` - Call-to-action button config
- `compact` - Smaller version for inline empty

### useAsyncOperation

Manage async data fetching with retry.

```jsx
const { 
  data,           // Fetched data
  error,          // Error if failed
  loading,        // Loading state
  retryCount,     // Number of retries attempted
  isSuccess,      // data !== null && error === null
  isError,        // error !== null
  isLoading,      // loading === true
  execute,        // Manually execute the operation
  retry,          // Retry the operation
} = useAsyncOperation(
  () => fetch('/api/bills').then(r => r.json()),
  {
    context: '[BillsList]',
    autoExecute: true,
    maxRetries: 3,
    retryDelays: [0, 2000, 5000],
    onSuccess: (data) => console.log('Success', data),
    onError: (error) => console.log('Failed', error),
  }
);
```

### useLazyAsyncOperation

Like useAsyncOperation but manual trigger (doesn't auto-execute).

```jsx
const { execute, data, error, loading } = useLazyAsyncOperation(
  () => saveService(formData),
  { context: '[ServiceDialog]' }
);
```

### useAsyncOperationWithCache

useAsyncOperation with 5-minute caching.

```jsx
const { 
  data, 
  error, 
  loading,
  clearCache  // Manually clear the cache
} = useAsyncOperationWithCache(
  () => fetchUserProfile(userId),
  {
    cacheKey: `profile-${userId}`,
    cacheTime: 5 * 60 * 1000 // Cache duration
  }
);
```

---

## Error Handling Utilities

### logError(context, action, error, metadata)

Log an error with debugging context.

```jsx
logError(
  '[BillsList]',
  'Failed to fetch bills',
  error,
  { serviceId: '12345', timestamp: new Date() }
);
```

### retryWithBackoff(fn, maxRetries, delays)

Retry an async function with exponential backoff.

```jsx
const result = await retryWithBackoff(
  () => fetch('/api/data').then(r => r.json()),
  3,              // maxRetries
  [0, 2000, 5000] // delays in ms
);
```

### getErrorMessage(error, fallback)

Convert technical error to user-friendly message.

```jsx
const msg = getErrorMessage(error, 'Unable to load data');
// "Network error" → "Unable to connect. Please check your internet connection."
// "timeout" → "This took longer than expected. Please try again."
// unknown → "Unable to load data"
```

### isRecoverableError(error)

Check if error should be retried.

```jsx
if (isRecoverableError(error)) {
  // Network error → retry
  retry();
} else {
  // Invalid data → don't retry, show error
  showError(error);
}
```

### safeJsonParse(json, fallback)

Safe JSON parse with fallback.

```jsx
const data = safeJsonParse(jsonString, { default: 'value' });
```

---

## Checklist for Production Components

Every component fetching data must have:

- [ ] Loading state (skeleton or spinner)
- [ ] Success state (data rendered)
- [ ] Empty state (when no data)
- [ ] Error state (with user-friendly message)
- [ ] Retry mechanism (button or auto-retry)
- [ ] State preservation (form inputs saved)
- [ ] Logging (errors logged with context)
- [ ] Offline support (cached data if applicable)

**Missing any? Your component is incomplete and must not ship to production.**

---

## Migration Guide

Converting existing components to follow graceful degradation:

### Before (No Error Handling)

```jsx
function BillsList() {
  const [bills, setBills] = useState([]);

  useEffect(() => {
    fetch('/api/bills')
      .then(r => r.json())
      .then(setBills);
  }, []);

  return <div>{bills.map(b => ...)}</div>; // Blank if fetch fails
}
```

### After (With Graceful Degradation)

```jsx
function BillsList() {
  const { data: bills, error, loading, retry } = useAsyncOperation(
    () => fetch('/api/bills').then(r => r.json()),
    { context: '[BillsList]' }
  );

  if (loading) return <Loader />;
  if (error) return <ErrorState onRetry={retry} />;
  if (!bills?.length) return <EmptyState />;

  return <div>{bills.map(b => ...)}</div>;
}
```

---

## Testing

Test all state combinations:

```jsx
describe('BillsList', () => {
  test('shows loader while fetching', () => {
    // Mock useAsyncOperation to return loading: true
    const { getByRole } = render(<BillsList />);
    expect(getByRole('status')).toBeInTheDocument();
  });

  test('shows error when fetch fails', () => {
    // Mock error state
    const { getByText } = render(<BillsList />);
    expect(getByText(/unable to load/i)).toBeInTheDocument();
  });

  test('shows empty state when no bills', () => {
    // Mock empty data
    const { getByText } = render(<BillsList />);
    expect(getByText(/no bills/i)).toBeInTheDocument();
  });

  test('shows bills when data loaded', () => {
    // Mock success state
    const { getByText } = render(<BillsList />);
    expect(getByText('Bill Amount')).toBeInTheDocument();
  });
});
```

---

## Best Practices

✅ **DO:**
- Wrap every async operation with error handling
- Show previous data while fetching updates
- Log errors with sufficient context
- Test all error states
- Preserve user input on failure
- Use Empty State for no-data scenarios

❌ **DON'T:**
- Display blank screens on error
- Show raw error messages to users
- Retry indefinitely
- Block navigation due to one widget failure
- Clear form inputs on error
- Ignore network failures
- Expose stack traces

---

## Support

For questions or issues:
1. Check [docs/STANDARDS.md](STANDARDS.md) sections 9.1-9.13
2. Review examples in this guide
3. Search existing implementations in `src/features/`
