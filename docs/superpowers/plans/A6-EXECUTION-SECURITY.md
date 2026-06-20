# A6 Code-Execution Security Model

How the platform runs **untrusted candidate code** without a hosted code-exec API and
without a self-hosted sandbox VM/container. Isolation is split into a **code layer**
(shipped in `lib/lib/execution/runner.py`) and a **deploy layer** (manifests in
`deploy/` + the requirements below). **Both layers are required.**

## Threat model

Candidate code is the most hostile input on the platform — an unknown external party on
a cheat-proof interview product. Assume it is actively malicious: it will try to read
secrets, reach the network/internal services, exhaust resources, and escape. The design
goal is **least privilege in the process, isolation in the platform** — never run the
executor privileged to "sandbox harder", because a privileged process running attacker
code turns any escape into host compromise.

## Code layer (in `lib.execution.run_code` — already enforced)

| Control | Mechanism | Stops |
|---|---|---|
| CPU burn | `RLIMIT_CPU` | infinite loops |
| Memory | `RLIMIT_AS` (Linux) | host OOM |
| Output / disk | `RLIMIT_FSIZE` + parent-side truncation | disk/log fill |
| Core dumps | `RLIMIT_CORE=0` | disk fill / leak |
| Secret theft | **scrubbed env** (child gets only `PATH`/`HOME`/`LANG`) | exfiltrating creds |
| Hang / fork bomb | wall-clock `SIGKILL` of the **process group** | zombie/blocked workers |
| Blast radius | separate process, own session | crash/OOM killing the parent |

Notes:
- `RLIMIT_AS` is applied on **Linux only** (macOS reserves a large virtual address space
  at interpreter startup, so capping it there breaks the child). Prod is Linux; the
  authoritative memory cap is the cgroup below regardless.
- `RLIMIT_NPROC` is **not** set in-process — it is per-UID, so an absolute cap breaks the
  interpreter on a shared UID. Fork bombs are bounded by the wall-clock `killpg` here and
  the cgroup `pids.max` below.
- The executor is **POSIX-only** and raises on a non-POSIX host.

## Deploy layer (REQUIRED — not optional)

The code layer does **not** block network or arbitrary filesystem reads. These are hard
requirements for any environment that runs the executor:

1. **Deny-egress NetworkPolicy** — `deploy/coding-executor-networkpolicy.yaml`. L3/L4
   egress denial. **Caveat:** only enforced by a CNI that supports NetworkPolicy
   (Calico/Cilium, not flannel alone). **Verify enforcement and assert at deploy** that
   the policy is applied — a silently-unenforced policy is worse than none. Off-k8s, use
   host egress-firewall rules.
2. **seccomp deny-socket** — `deploy/coding-executor-seccomp.json`. Denies the `socket`
   syscall family → syscall-level network denial with **no privilege**. Reference via the
   Pod `securityContext.seccompProfile.localhostProfile`.
3. **Unprivileged, non-root** — `runAsNonRoot: true`, `allowPrivilegeEscalation: false`,
   `capabilities.drop: ["ALL"]`. This is the single biggest risk reduction; never grant
   `CAP_SYS_ADMIN`/privilege to the executor.
4. **Secrets as env only** — never mount secrets as files the child could read. The
   in-process env scrub then fully protects them.
5. **cgroup mem/PID caps** — `resources.limits` (memory + `pids`) are the authoritative
   caps over the coarse in-process rlimits.

### Pod securityContext (template)

```yaml
securityContext:
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  capabilities: { drop: ["ALL"] }
  seccompProfile:
    type: Localhost
    localhostProfile: coding-executor-seccomp.json
# resources.limits.memory + resources.limits.pids = authoritative mem/PID caps
```

### Optional hardening — dedicated executor Deployment

Run the executor in a **dedicated Deployment of the same image** (no new code, no new
dependency), **secret-free** (no DB/S3 creds in its env at all) and deny-egress. Even if
egress leaked, there are no creds to steal and nothing sensitive reachable. Recommended
for production.

## Rejected alternative — code-level network namespaces

`unshare(CLONE_NEWNET)` would deny network in-process, but it requires a **privileged**
worker (CAP_SYS_ADMIN). Running attacker code in a privileged process expands the blast
radius of any escape far more than the egress it blocks; unprivileged user-namespaces are
kernel-fragile, often disabled on managed clusters, and a frequent privesc-CVE source.
Seccomp deny-socket achieves the same network denial **without privilege**, so namespaces
were rejected. Only revisit if the platform is off-k8s with no egress-firewall option.

## Residual risk if the deploy layer is skipped

With ONLY the code layer (no NetworkPolicy/seccomp): candidate code could open network
connections (SSRF into internal services) and read world-readable files. The env scrub
still prevents credential theft via env, and resource caps still prevent DoS — but
**network + filesystem isolation depend on the deploy layer**. Do not run the executor in
production without it.
