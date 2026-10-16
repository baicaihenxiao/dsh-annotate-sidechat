/**
 * Host half of the bundle. The feature is entirely Client-side: selection
 * capture, the annotation popover, and the forked side-chat tab all read and
 * drive the page through Client services. Nothing here needs a Host route,
 * so `apply` is intentionally empty.
 */
export function apply() {}
