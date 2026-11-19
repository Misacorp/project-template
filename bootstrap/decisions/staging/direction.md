## 2026-11-19: Design variants ship only to staging until the owner picks one

**Decision.** When a look or layout has several candidates, they are built behind one switch that exists only in staging builds, so the owner can try them in the real app. Production never sets a variant. When the owner picks one, it becomes the default and the others are deleted.

**Reasoning.** The owner judges best in the real app on their own device, not from stills alone. Keeping candidates out of production means no user sees an unfinished choice, and deleting the losers keeps the code from carrying dead options.
