import { goals, scenarios, type GoalId } from "@/content/demo";
import { planDemo } from "@/lib/plan-demo";
import { renderDays, renderMessages, renderPhases, renderWeeks } from "@/lib/plan-demo-view";

/**
 * Pilote la démo côté navigateur (hero + « Ton plan, en direct »). La page est déjà rendue au
 * build ; ce script ne fait que rebasculer l'état.
 *
 * Rotation : l'imprévu suivant toutes les 6 s. Un clic charge l'imprévu choisi et relance les 6 s
 * depuis lui. Pause tant que la souris ou le focus clavier est sur les imprévus, quand le hero sort de
 * l'écran, ou sur demande (bouton, WCAG 2.2.2). Rien ne tourne seul sous prefers-reduced-motion.
 */

export const ROTATION_MS = 6000;

export function startDemo(): void {
  const hero = document.querySelector<HTMLElement>("[data-demo-hero]");
  const planCard = document.querySelector<HTMLElement>("[data-demo-plan-card]");
  if (!hero || !planCard) return;

  const chips = [...hero.querySelectorAll<HTMLButtonElement>("[data-demo-scenario]")];
  const goalButtons = [...planCard.querySelectorAll<HTMLButtonElement>("[data-demo-goal]")];
  const chipsBox = hero.querySelector<HTMLElement>(".demo-box");
  const toggle = hero.querySelector<HTMLButtonElement>("[data-demo-toggle]");
  const counter = hero.querySelector<HTMLElement>("[data-demo-count]");
  const status = hero.querySelector<HTMLElement>("[data-demo-status]");
  const messages = hero.querySelector<HTMLElement>("[data-demo-messages]");
  const weeks = planCard.querySelector<HTMLElement>("[data-demo-weeks]");
  const phases = planCard.querySelector<HTMLElement>("[data-demo-phases]");
  const days = planCard.querySelector<HTMLElement>("[data-demo-days]");
  const weekNote = planCard.querySelector<HTMLElement>("[data-demo-week-note]");
  const field = (name: string) => planCard.querySelector<HTMLElement>(`[data-demo-field="${name}"]`);

  const state = {
    goal: (goals[0]?.id ?? "triathlon-l") as GoalId,
    scenarioIndex: 0,
    clicks: 0,
    userPaused: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    hovered: false,
    focused: false,
    visible: true,
  };
  let timer: number | undefined;

  const render = () => {
    const scenario = scenarios[state.scenarioIndex] ?? null;
    const demo = planDemo(state.goal, scenario?.id ?? null);

    chips.forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.demoScenario === scenario?.id)));
    goalButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.demoGoal === state.goal)));

    if (messages) messages.innerHTML = renderMessages(demo.messages);
    if (status) status.textContent = (scenario ? status.dataset.labelAdjusted : status.dataset.labelIdle) ?? "";
    if (counter) counter.textContent = String(state.clicks);

    planCard.style.setProperty("--weeks", String(demo.goal.weeks));
    setText(field("race"), demo.goal.race);
    setText(field("target"), demo.goal.target);
    setText(field("format"), demo.goal.format);
    setText(field("hours"), demo.goal.hours);
    setText(field("weeks"), String(demo.goal.weeks));
    setText(field("current-week"), String(demo.currentWeek));
    if (weeks) weeks.innerHTML = renderWeeks(demo.weeks);
    if (phases) phases.innerHTML = renderPhases(demo.phases);
    if (days) days.innerHTML = renderDays(demo.days, days.dataset.badge ?? "");
    if (weekNote) {
      const label = demo.adjustedDays > 1 ? weekNote.dataset.labelMany : weekNote.dataset.labelOne;
      weekNote.textContent = scenario ? `${demo.adjustedDays} ${label ?? ""}` : (weekNote.dataset.labelPlanned ?? "");
      weekNote.classList.toggle("is-adjusted", scenario !== null);
    }
  };

  /** Relance la barre de progression de l'imprévu actif (même s'il était déjà actif). */
  const restartProgress = () => {
    hero.dataset.demoState = "paused";
    void hero.offsetWidth;
    hero.dataset.demoState = isRunning() ? "playing" : "paused";
  };

  const isRunning = () => !state.userPaused && !state.hovered && !state.focused && state.visible;

  /** (Re)démarre un cycle complet de 6 s si la démo doit tourner, sinon la fige. */
  const schedule = () => {
    window.clearTimeout(timer);
    timer = undefined;
    restartProgress();
    if (!isRunning()) return;
    timer = window.setTimeout(() => {
      state.scenarioIndex = (state.scenarioIndex + 1) % scenarios.length;
      render();
      schedule();
    }, ROTATION_MS);
  };

  /** Applique un changement de pause/lecture sans redémarrer un cycle déjà en cours. */
  const syncPlayback = () => {
    const running = isRunning();
    if (running && timer === undefined) schedule();
    if (!running && timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
      hero.dataset.demoState = "paused";
    }
    if (toggle) {
      const key = state.userPaused ? "Play" : "Pause";
      toggle.textContent = toggle.dataset[`label${key}`] ?? "";
      toggle.setAttribute("aria-label", toggle.dataset[`aria${key}`] ?? "");
    }
  };

  chips.forEach((chip, index) =>
    chip.addEventListener("click", () => {
      state.scenarioIndex = index;
      state.clicks += 1;
      render();
      schedule();
    }),
  );
  goalButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const goal = goals.find((candidate) => candidate.id === button.dataset.demoGoal);
      if (!goal) return;
      state.goal = goal.id;
      render();
    }),
  );

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      state.userPaused = !state.userPaused;
      syncPlayback();
    });
  }
  chipsBox?.addEventListener("mouseenter", () => {
    state.hovered = true;
    syncPlayback();
  });
  chipsBox?.addEventListener("mouseleave", () => {
    state.hovered = false;
    syncPlayback();
  });
  // Seul le focus clavier met en pause : après un clic, le bouton garde le focus et la
  // rotation doit continuer.
  chipsBox?.addEventListener("focusin", (event) => {
    if (!(event.target instanceof Element) || !event.target.matches(":focus-visible")) return;
    state.focused = true;
    syncPlayback();
  });
  chipsBox?.addEventListener("focusout", (event) => {
    if (chipsBox.contains(event.relatedTarget as Node | null)) return;
    state.focused = false;
    syncPlayback();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      state.visible = entry?.isIntersecting ?? true;
      syncPlayback();
    }).observe(hero);
  }

  hero.style.setProperty("--rotation-ms", `${ROTATION_MS}ms`);
  render();
  syncPlayback();
}

function setText(element: HTMLElement | null, text: string): void {
  if (element) element.textContent = text;
}
