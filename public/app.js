import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

createApp({
  data() {
    return {
      message: "Ready to plan your next trip?",
    };
  },
  methods: {
    updateMessage() {
      this.message = "Atmos is ready for your adventure!";
    },
  },
}).mount("#app");
