"""Import all models so `Base.metadata` is fully populated (Alembic + create_all).

Also declares the RLS table groupings the initial migration applies:
- ORG_SCOPED_TABLES: `organization_id = current_org` isolation policy.
- `organization` and `org_membership` get bespoke policies (see migration).
- Everything else (auth + user-global tables, billing stub) has no org RLS.
"""

from app.models.auth import OneTimeCode, Session
from app.models.chat import ChatConversation, ChatMessage
from app.models.collab import (
    ActivityEvent,
    ProjectAttachment,
    ProjectComment,
    TaskAttachment,
    TaskComment,
)
from app.models.identity import (
    AccessGrant,
    Group,
    GroupMembership,
    OrgMembership,
    Organization,
    User,
)
from app.models.platform import AuditLog, BillingAccount, Notification, UserPreference
from app.models.work import (
    Label,
    Project,
    ProjectTaskGroup,
    Task,
    TaskDependency,
    TaskGroupDefinition,
    TaskLabel,
    TaskStatus,
)

__all__ = [
    "AccessGrant", "ActivityEvent", "AuditLog", "BillingAccount",
    "ChatConversation", "ChatMessage", "Group",
    "GroupMembership", "Label", "Notification", "OneTimeCode", "OrgMembership",
    "Organization", "Project", "ProjectAttachment", "ProjectComment",
    "ProjectTaskGroup", "Session", "Task", "TaskAttachment", "TaskComment",
    "TaskDependency", "TaskGroupDefinition", "TaskLabel", "TaskStatus",
    "User", "UserPreference",
]

# Org-scoped tables that get the standard `organization_id = current_org` policy.
# (organization + org_membership are handled specially in the migration.)
ORG_SCOPED_TABLES = [
    "user_group",
    "group_membership",
    "access_grant",
    "project",
    "task_group_definition",
    "project_task_group",
    "task",
    "task_status",
    "label",
    "task_label",
    "task_dependency",
    "task_comment",
    "project_comment",
    "task_attachment",
    "project_attachment",
    "activity_event",
    "notification",
    "audit_log",
    "chat_conversation",
    "chat_message",
]
