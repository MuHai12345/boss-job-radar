// build:local replaces the emitted JS with the digest of that build's JS files.
// Direct source execution must never masquerade as a production build.
export const LOCAL_BUILD_ID: string = 'unbuilt';
