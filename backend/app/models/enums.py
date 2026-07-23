"""String-valued domain constants.

Stored as plain strings (not PG enums) so the catalog can evolve without an
enum-altering migration. Values are validated at the app layer.
"""


class Role:
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"

    ALL = (OWNER, ADMIN, MEMBER, VIEWER)
    # Rank for "most permissive wins" resolution (higher = more powerful).
    RANK = {VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4}


class GroupType:
    """A people-principal. `team` doubles as a project container (owns projects);
    `group` is permission-only (grantable to projects via Security)."""

    TEAM = "team"
    GROUP = "group"

    ALL = (TEAM, GROUP)


class MemberRole:
    """A user's role *within* a team/group (distinct from the AccessGrant role
    catalog). Synced to a scoped AccessGrant: owner→OWNER, member→MEMBER."""

    OWNER = "owner"
    MEMBER = "member"

    ALL = (OWNER, MEMBER)


class PrincipalType:
    USER = "user"
    GROUP = "group"


class ScopeType:
    ORG = "org"
    TEAM = "team"
    PROJECT = "project"


class Channel:
    EMAIL = "email"
    SMS = "sms"


class Priority:
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

    ALL = (NONE, LOW, MEDIUM, HIGH, URGENT)


class AttachmentKind:
    FILE = "file"
    LINK = "link"


class SubscriberType:
    USER = "user"
    ORG = "org"
