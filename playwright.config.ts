import { defineConfig } from '@playwright/test';
const port=process.env.APEX_E2E_PORT??'8091';
const origin=`http://localhost:${port}`;
export default defineConfig({testDir:'./tests',fullyParallel:false,workers:1,timeout:60000,use:{baseURL:origin,channel:'msedge',headless:true,trace:'retain-on-failure'},webServer:[{command:'npx tsx supabase/tests/http-fixture.ts',url:'http://127.0.0.1:54329/health',reuseExistingServer:false,timeout:30000,env:{APEX_TEST_WEB_ORIGIN:origin}},{command:`npx expo start --web --port ${port}`,url:origin,reuseExistingServer:false,timeout:120000,env:{CI:'1',EXPO_OFFLINE:'1',EXPO_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-test-only',EXPO_PUBLIC_AUTH_REDIRECT_URL:`${origin}/auth/invite`}}]});
