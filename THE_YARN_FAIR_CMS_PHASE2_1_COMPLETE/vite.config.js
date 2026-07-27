import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({build:{rollupOptions:{input:{
home:resolve(__dirname,'index.html'),exhibitors:resolve(__dirname,'exhibitors.html'),
company:resolve(__dirname,'company.html'),contact:resolve(__dirname,'contact.html'),
registration:resolve(__dirname,'registration.html'),
registrationComplete:resolve(__dirname,'registration-complete.html'),
staffLogin:resolve(__dirname,'staff-login.html'),admin:resolve(__dirname,'admin.html'),
checkin:resolve(__dirname,'checkin.html')}}}});
