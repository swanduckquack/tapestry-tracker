import fs from 'node:fs';
import path from 'node:path';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_KEY || '';

if (url && key) {
  const outPath = path.resolve('src/environments/environment.ts');
  const content = `export const environment = {
  production: true,
  supabaseUrl: ${JSON.stringify(url)},
  supabaseAnonKey: ${JSON.stringify(key)},
};
`;
  fs.writeFileSync(outPath, content, 'utf8');
  console.log('Injected SUPABASE_URL and SUPABASE_KEY into src/environments/environment.ts');
} else {
  console.log('SUPABASE_URL / SUPABASE_KEY not set — keeping default environment.ts');
}
