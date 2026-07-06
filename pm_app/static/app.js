const state = {
  session: null,
  projects: [],
  tasks: [],
  selectedTask: null,
  mode: "list",
};

const statuses = [
  ["todo", "Todo"],
  ["in_progress", "In progress"],
  ["blocked", "Blocked"],
  ["done", "Done"],
];

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function fmt(value) {
  return value ? String(value).replaceAll("_", " ") : "None";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function boot() {
  state.session = await api("/api/session");
  state.projects = (await api("/api/projects")).projects;
  $("workspaceName").textContent = state.session.workspace.name;
  $("userName").textContent = state.session.user.display_name;
  $("userRole").textContent = state.session.membership.role;
  $("userAvatar").textContent = state.session.user.display_name.slice(0, 1);
  renderProjectFilter();
  renderAssignees();
  bindEvents();
  await refreshTasks();
  await refreshNotifications();
  await refreshBilling();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchSection(button.dataset.section));
  });
  $("projectFilter").addEventListener("change", refreshTasks);
  $("newTaskButton").addEventListener("click", () => selectTask(null));
  $("listMode").addEventListener("click", () => setMode("list"));
  $("boardMode").addEventListener("click", () => setMode("board"));
  $("taskForm").addEventListener("submit", saveTask);
  $("commentForm").addEventListener("submit", addComment);
  $("attachmentForm").addEventListener("submit", addAttachment);
  $("searchInput").addEventListener("input", debounce(runSearch, 220));
  $("refreshNotifications").addEventListener("click", refreshNotifications);
  $("checkoutButton").addEventListener("click", createCheckoutIntent);
}

function switchSection(section) {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.section === section));
  document.querySelectorAll(".section").forEach((item) => item.classList.remove("active-section"));
  $(`${section}Section`).classList.add("active-section");
}

function renderProjectFilter() {
  $("projectFilter").innerHTML = [
    '<option value="">All projects</option>',
    ...state.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`),
  ].join("");
}

function renderAssignees() {
  $("taskAssignee").innerHTML = [
    '<option value="">Unassigned</option>',
    ...state.session.members.map((member) => `<option value="${member.id}">${escapeHtml(member.display_name)}</option>`),
  ].join("");
}

async function refreshTasks() {
  const params = new URLSearchParams();
  if ($("projectFilter").value) params.set("project_id", $("projectFilter").value);
  state.tasks = (await api(`/api/tasks?${params}`)).tasks;
  renderTasks();
  if (!state.selectedTask && state.tasks.length) {
    selectTask(state.tasks[0].id);
  } else if (state.selectedTask) {
    const current = state.tasks.find((task) => task.id === state.selectedTask.id);
    if (current) selectTask(current.id);
  }
}

function renderTasks() {
  renderList();
  renderBoard();
}

function renderList() {
  $("taskList").innerHTML = state.tasks.map((task) => `
    <article class="task-row ${state.selectedTask?.id === task.id ? "selected" : ""}" data-task-id="${task.id}">
      <div class="task-title">
        <strong>${escapeHtml(task.title)}</strong>
        <span class="meta">${escapeHtml(task.project_name || "No project")} · ${escapeHtml(task.assignee_name || "Unassigned")} · Due ${escapeHtml(task.due_date || "none")}</span>
      </div>
      <span class="pill status-${task.status}">${fmt(task.status)}</span>
      <span class="pill priority-${task.priority}">${fmt(task.priority)}</span>
    </article>
  `).join("");
  document.querySelectorAll(".task-row").forEach((row) => row.addEventListener("click", () => selectTask(row.dataset.taskId)));
}

function renderBoard() {
  $("taskBoard").innerHTML = statuses.map(([status, label]) => {
    const cards = state.tasks.filter((task) => task.status === status).map((task) => `
      <article class="task-card" data-task-id="${task.id}">
        <strong>${escapeHtml(task.title)}</strong>
        <span class="pill priority-${task.priority}">${fmt(task.priority)}</span>
        <div class="meta">${escapeHtml(task.assignee_name || "Unassigned")}</div>
      </article>
    `).join("");
    return `<section class="column"><h4>${label}</h4>${cards}</section>`;
  }).join("");
  document.querySelectorAll(".task-card").forEach((card) => card.addEventListener("click", () => selectTask(card.dataset.taskId)));
}

function setMode(mode) {
  state.mode = mode;
  $("listMode").classList.toggle("active", mode === "list");
  $("boardMode").classList.toggle("active", mode === "board");
  $("taskList").classList.toggle("hidden", mode !== "list");
  $("taskBoard").classList.toggle("hidden", mode !== "board");
}

async function selectTask(taskId) {
  state.selectedTask = taskId ? await api(`/api/tasks/${taskId}`) : null;
  $("detailTitle").textContent = state.selectedTask ? "Task Detail" : "New Task";
  $("taskIdLabel").textContent = state.selectedTask?.id || "";
  $("taskTitle").value = state.selectedTask?.title || "";
  $("taskDescription").value = state.selectedTask?.description || "";
  $("taskStatus").value = state.selectedTask?.status || "todo";
  $("taskPriority").value = state.selectedTask?.priority || "medium";
  $("taskAssignee").value = state.selectedTask?.assignee_id || "";
  $("taskDueDate").value = state.selectedTask?.due_date || "";
  renderComments();
  renderAttachments();
  renderTasks();
}

async function saveTask(event) {
  event.preventDefault();
  const payload = {
    title: $("taskTitle").value,
    description: $("taskDescription").value,
    status: $("taskStatus").value,
    priority: $("taskPriority").value,
    assignee_id: $("taskAssignee").value || null,
    due_date: $("taskDueDate").value || null,
    project_id: $("projectFilter").value || state.projects[0]?.id || null,
  };
  if (state.selectedTask) {
    state.selectedTask = await api(`/api/tasks/${state.selectedTask.id}`, { method: "PATCH", body: JSON.stringify(payload) });
  } else {
    state.selectedTask = await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
  }
  await refreshTasks();
}

function renderComments() {
  const comments = state.selectedTask?.comments || [];
  $("comments").innerHTML = comments.length ? comments.map((comment) => `
    <div class="comment">
      <strong>${escapeHtml(comment.author_name)}</strong>
      <p>${escapeHtml(comment.body)}</p>
      <span class="meta">${escapeHtml(comment.created_at)}</span>
    </div>
  `).join("") : '<p class="meta">No comments yet.</p>';
}

async function addComment(event) {
  event.preventDefault();
  if (!state.selectedTask || !$("commentBody").value.trim()) return;
  await api(`/api/tasks/${state.selectedTask.id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: $("commentBody").value }),
  });
  $("commentBody").value = "";
  await selectTask(state.selectedTask.id);
}

function renderAttachments() {
  const attachments = state.selectedTask?.attachments || [];
  $("attachments").innerHTML = attachments.length ? attachments.map((attachment) => `
    <a class="attachment" href="${escapeHtml(attachment.url)}" target="_blank" rel="noreferrer">
      ${escapeHtml(attachment.file_name)}
      <span class="meta">${escapeHtml(attachment.mime_type)}</span>
    </a>
  `).join("") : '<p class="meta">No attachments yet.</p>';
}

async function addAttachment(event) {
  event.preventDefault();
  if (!state.selectedTask || !$("attachmentName").value.trim() || !$("attachmentUrl").value.trim()) return;
  await api(`/api/tasks/${state.selectedTask.id}/attachments`, {
    method: "POST",
    body: JSON.stringify({
      file_name: $("attachmentName").value,
      url: $("attachmentUrl").value,
    }),
  });
  $("attachmentName").value = "";
  $("attachmentUrl").value = "";
  await selectTask(state.selectedTask.id);
}

async function runSearch() {
  const query = $("searchInput").value.trim();
  if (!query) {
    $("searchResults").classList.add("hidden");
    $("searchResults").innerHTML = "";
    return;
  }
  const results = await api(`/api/search?q=${encodeURIComponent(query)}`);
  const hits = [
    ...results.tasks.map((task) => ({ type: "Task", id: task.id, label: task.title })),
    ...results.projects.map((project) => ({ type: "Project", id: project.id, label: project.name })),
  ];
  $("searchResults").innerHTML = hits.length ? hits.map((hit) => `
    <div class="search-hit" data-id="${hit.id}" data-type="${hit.type}">
      <strong>${hit.type}</strong>
      <div>${escapeHtml(hit.label)}</div>
    </div>
  `).join("") : '<div class="search-hit">No results</div>';
  $("searchResults").classList.remove("hidden");
  document.querySelectorAll(".search-hit[data-type='Task']").forEach((hit) => {
    hit.addEventListener("click", async () => {
      $("searchResults").classList.add("hidden");
      switchSection("tasks");
      await selectTask(hit.dataset.id);
    });
  });
}

async function refreshNotifications() {
  const notifications = (await api("/api/notifications")).notifications;
  $("notificationsList").innerHTML = notifications.length ? notifications.map((notification) => `
    <article class="notification ${notification.is_read ? "" : "unread"}">
      <div>
        <strong>${escapeHtml(notification.title)}</strong>
        <p>${escapeHtml(notification.body)}</p>
        <span class="meta">${escapeHtml(notification.created_at)}</span>
      </div>
      <button data-notification-id="${notification.id}" ${notification.is_read ? "disabled" : ""}>Mark read</button>
    </article>
  `).join("") : '<p class="meta">No notifications.</p>';
  document.querySelectorAll("[data-notification-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/notifications/${button.dataset.notificationId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_read: true }),
      });
      await refreshNotifications();
    });
  });
}

async function refreshBilling() {
  const account = await api("/api/billing/account");
  $("billingAccount").innerHTML = `
    <div class="billing-row"><strong>Plan</strong><div>${escapeHtml(account.plan)}</div></div>
    <div class="billing-row"><strong>Status</strong><div>${escapeHtml(account.status)}</div></div>
    <div class="billing-row"><strong>Seats</strong><div>${escapeHtml(account.seats)}</div></div>
    <div class="billing-row"><strong>Trial ends</strong><div>${escapeHtml(account.trial_ends_at || "None")}</div></div>
  `;
}

async function createCheckoutIntent() {
  const intent = await api("/api/billing/checkout-intent", {
    method: "POST",
    body: JSON.stringify({ plan: "team", seats: state.session.members.length }),
  });
  alert(intent.message);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="shell"><h1>Unable to start</h1><p>${escapeHtml(error.message)}</p></main>`;
});

