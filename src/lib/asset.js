// Where the files in public/ live. On GitHub Pages the app is under
// /<repo-name>/, so "/logo.png" would point to the wrong place.
export const asset = (name) => import.meta.env.BASE_URL + name
