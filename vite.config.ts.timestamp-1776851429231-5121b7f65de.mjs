// vite.config.ts
import tailwindcss from "file:///home/itb04/Desktop/digital-library-manish/digital-Library-Manish/node_modules/@tailwindcss/vite/dist/index.mjs";
import react from "file:///home/itb04/Desktop/digital-library-manish/digital-Library-Manish/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { defineConfig, loadEnv } from "file:///home/itb04/Desktop/digital-library-manish/digital-Library-Manish/node_modules/vite/dist/node/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), ".")
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true"
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9pdGIwNC9EZXNrdG9wL2RpZ2l0YWwtbGlicmFyeS1tYW5pc2gvZGlnaXRhbC1MaWJyYXJ5LU1hbmlzaFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvaXRiMDQvRGVza3RvcC9kaWdpdGFsLWxpYnJhcnktbWFuaXNoL2RpZ2l0YWwtTGlicmFyeS1NYW5pc2gvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvaXRiMDQvRGVza3RvcC9kaWdpdGFsLWxpYnJhcnktbWFuaXNoL2RpZ2l0YWwtTGlicmFyeS1NYW5pc2gvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHtkZWZpbmVDb25maWcsIGxvYWRFbnZ9IGZyb20gJ3ZpdGUnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHttb2RlfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsICcuJywgJycpO1xuICByZXR1cm4ge1xuICAgIHBsdWdpbnM6IFtyZWFjdCgpLCB0YWlsd2luZGNzcygpXSxcbiAgICBkZWZpbmU6IHtcbiAgICAgICdwcm9jZXNzLmVudi5HRU1JTklfQVBJX0tFWSc6IEpTT04uc3RyaW5naWZ5KGVudi5HRU1JTklfQVBJX0tFWSksXG4gICAgfSxcbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICAnQCc6IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCAnLicpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgLy8gSE1SIGlzIGRpc2FibGVkIGluIEFJIFN0dWRpbyB2aWEgRElTQUJMRV9ITVIgZW52IHZhci5cbiAgICAgIC8vIERvIG5vdCBtb2RpZnlcdTAwRTJcdTAwODBcdTAwOTRmaWxlIHdhdGNoaW5nIGlzIGRpc2FibGVkIHRvIHByZXZlbnQgZmxpY2tlcmluZyBkdXJpbmcgYWdlbnQgZWRpdHMuXG4gICAgICBobXI6IHByb2Nlc3MuZW52LkRJU0FCTEVfSE1SICE9PSAndHJ1ZScsXG4gICAgfSxcbiAgfTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFxWCxPQUFPLGlCQUFpQjtBQUM3WSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVEsY0FBYyxlQUFjO0FBRXBDLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUMsS0FBSSxNQUFNO0FBQ3RDLFFBQU0sTUFBTSxRQUFRLE1BQU0sS0FBSyxFQUFFO0FBQ2pDLFNBQU87QUFBQSxJQUNMLFNBQVMsQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQUEsSUFDaEMsUUFBUTtBQUFBLE1BQ04sOEJBQThCLEtBQUssVUFBVSxJQUFJLGNBQWM7QUFBQSxJQUNqRTtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ0wsS0FBSyxLQUFLLFFBQVEsUUFBUSxJQUFJLEdBQUcsR0FBRztBQUFBLE1BQ3RDO0FBQUEsSUFDRjtBQUFBLElBQ0EsUUFBUTtBQUFBO0FBQUE7QUFBQSxNQUdOLEtBQUssUUFBUSxJQUFJLGdCQUFnQjtBQUFBLElBQ25DO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
