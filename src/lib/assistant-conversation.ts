export function compactAssistantHistory(
  items: { role: "user" | "model"; text: string }[],
) {
  let history = items
    .slice(-10)
    .map((message) => ({
      role: message.role,
      text: message.text.slice(0, 8000),
    }));
  while (
    history.length > 1 &&
    history.reduce((size, message) => size + message.text.length, 0) > 24000
  )
    history = history.slice(1);
  while (history[0]?.role === "model") history = history.slice(1);
  return history;
}
