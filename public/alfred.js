/* ALFRED — a tiny, dependency-free quiz host for browser clients. */
(function attachAlfred(global) {
  "use strict";

  const expressions = new Set(["neutral", "thinking", "happy", "sad", "derpy", "sleepy", "open"]);

  function selectBritishVoice() {
    if (!("speechSynthesis" in global)) return null;
    const voices = global.speechSynthesis.getVoices();
    const british = voices.filter((voice) => /^en[-_]GB/i.test(voice.lang));
    // Prefer mature-sounding UK system voices. Availability varies by OS, so
    // retain a reliable en-GB fallback rather than hard-coding one vendor.
    return british.find((voice) => /george|daniel|oliver|male|serena/i.test(voice.name)) || british[0] || null;
  }

  class Alfred {
    constructor(options = {}) {
      this.options = { rate: 0.78, pitch: 0.66, volume: 1, ...options };
      this.element = this.buildFace();
      this.expression = "happy";
      this.voice = selectBritishVoice();
      this._onVoicesChanged = () => { this.voice = selectBritishVoice(); };
      if ("speechSynthesis" in global) global.speechSynthesis.addEventListener("voiceschanged", this._onVoicesChanged);
      this.setExpression(options.expression || "happy");
    }

    buildFace() {
      const wrapper = document.createElement("section");
      wrapper.className = "alfred";
      wrapper.setAttribute("role", "status");
      wrapper.setAttribute("aria-label", "ALFRED, the quiz host");
      wrapper.innerHTML = `
        <div class="alfred__halo"></div>
        <div class="alfred__face" aria-hidden="true">
          <div class="alfred__eye alfred__eye--left"><i></i></div>
          <div class="alfred__eye alfred__eye--right"><i></i></div>
          <div class="alfred__mouth"></div>
          <div class="alfred__bowtie"><i></i></div>
          <span class="alfred__z alfred__z--one">Z</span><span class="alfred__z alfred__z--two">Z</span>
        </div>
        <p class="alfred__caption"><strong>ALFRED</strong><span>At your service.</span></p>`;
      return wrapper;
    }

    mount(target) {
      const parent = typeof target === "string" ? document.querySelector(target) : target;
      if (!parent) throw new Error("ALFRED mount target was not found.");
      parent.appendChild(this.element);
      return this;
    }

    setExpression(expression) {
      this.expression = expressions.has(expression) ? expression : "happy";
      this.element.dataset.expression = this.expression;
      return this;
    }

    speak(text, options = {}) {
      if (!text || !("speechSynthesis" in global)) return false;
      global.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = "en-GB";
      utterance.voice = selectBritishVoice() || this.voice;
      utterance.rate = options.rate || this.options.rate;
      utterance.pitch = options.pitch || this.options.pitch;
      utterance.volume = options.volume || this.options.volume;
      utterance.onstart = () => this.setExpression("open");
      utterance.onend = () => this.setExpression(options.afterExpression || "happy");
      utterance.onerror = () => this.setExpression("neutral");
      global.speechSynthesis.speak(utterance);
      return true;
    }

    announceQuestion(question, number) {
      const prefix = number ? `Question ${number}. ` : "";
      this.setExpression("thinking");
      return this.speak(`${prefix}${question}`, { afterExpression: "happy" });
    }

    stop() {
      if ("speechSynthesis" in global) global.speechSynthesis.cancel();
      this.setExpression("neutral");
    }

    destroy() {
      this.stop();
      if ("speechSynthesis" in global) global.speechSynthesis.removeEventListener("voiceschanged", this._onVoicesChanged);
      this.element.remove();
    }
  }

  global.Alfred = Alfred;
})(window);
