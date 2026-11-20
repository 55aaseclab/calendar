export function createWebIntegration() {
  return {
    "slug": "calendar",
    "policy": "grant",
    "kind": "static",
    "directory": "public",
    "assets": [
      "/calendar.js",
      "/calendar.css",
      "/calendar-events.js"
    ],
    "coreReads": [
      {
        "path": "/api/agenda",
        "upstream": "/api/business/workbench/agenda",
        "maximumBytes": 2097152
      }
    ]
  };
}
