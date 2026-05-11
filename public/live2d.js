(function () {
  const initLive2D = () => {
    if (!window.L2Dwidget) {
      console.warn("Live2D widget script was not loaded.");
      return;
    }

    window.L2Dwidget.init({
      model: {
        jsonPath: "https://unpkg.com/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json"
      },
      display: {
        position: "right",
        width: 150,
        height: 300,
        hOffset: 20,
        vOffset: -20
      },
      mobile: {
        show: true,
        scale: 0.5
      },
      react: {
        opacityDefault: 0.86,
        opacityOnHover: 1
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLive2D);
  } else {
    initLive2D();
  }
})();
