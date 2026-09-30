export function validateLocalEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "10086" || url.username || url.password) {
    throw new Error("Use http://127.0.0.1:10086/v1/chat/completions or http://localhost:10086/v1/chat/completions.");
  }
  return url.href;
}

export function validateQuiz(quiz) {
  if (!quiz || typeof quiz.title !== "string" || !quiz.title.trim() || !Array.isArray(quiz.questions) || !quiz.questions.length) throw new Error("Quiz needs a title and at least one question.");
  const types = ["multiple_choice", "choice", "checkbox", "checkboxes", "dropdown", "short_answer", "paragraph", "long_answer"];
  for (const q of quiz.questions) {
    if (!q || typeof q.title !== "string" || !q.title.trim() || !types.includes(q.type)) throw new Error("Every question needs a title and supported type.");
    if (["multiple_choice", "choice", "checkbox", "checkboxes", "dropdown"].includes(q.type)) {
      if (!Array.isArray(q.options) || q.options.some(o => typeof o !== "string" || !o.trim()) || new Set(q.options.map(o => o.trim())).size < 2) throw new Error("Choice questions need at least two distinct nonempty options.");
      if (q.correctAnswer !== undefined && (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]).some(a => !q.options.map(o => o.trim()).includes(String(a).trim()))) throw new Error("Correct answers must match the options.");
    }
    if (q.points !== undefined && (!Number.isInteger(q.points) || q.points < 0)) throw new Error("Points must be a nonnegative integer.");
    if (q.correctAnswer !== undefined && (q.points === undefined || (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]).some(a => typeof a !== "string" || !a.trim()))) throw new Error("Graded answers need nonempty text and points.");
  }
  return quiz;
}
