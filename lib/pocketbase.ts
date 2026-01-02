import PocketBase from 'pocketbase';

// PocketBase client instance
// Replace with your remote PocketBase server URL
const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');

export default pb;

