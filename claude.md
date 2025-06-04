# Software Development Guidelines for LLMs

## 🔄 Project Awareness & Context

- **Always begin by understanding the project context.** Read all available documentation (requirements, design docs, PRDs, TRDs, etc.) to grasp the architecture, goals, and constraints. Pay special attention to architectural decision records (ADRs) or technology choice documents to ensure your solutions align with prior decisions.
- **Check the task list or issue tracker** before coding. Ensure the task at hand is clearly defined. If the project uses a `TASKS.md` or similar, verify the task is listed; if not, add it with a brief description and date. Mark tasks as completed when done, and note any new issues or TODOs discovered during development.
- **Analyze the existing codebase and structure.** Review the repository layout, module structure, and naming conventions at the start. This awareness prevents duplicating functionality and ensures new code integrates consistently with the project's organization.
- **Follow established naming conventions and patterns.** Use the same terminology, folder structure, and architecture patterns the project already follows. Maintain consistency with things like file naming, class/component naming, and layering (for example, don't introduce a new design paradigm inconsistent with the rest of the project).
- **ALWAYS** use the context7 tool to understand proper library use when working with any library, testing code that uses a library, or when troubleshooting issues related to a library. For example, if running in to issues trying to mock a library for automated tests, implementing a feature that relies on a library, etc.

## 🧱 Code Structure & Modularity

- **Keep files and functions small and focused.** Never create a file longer than ~500 lines of code. If a file grows too large, refactor and split it into multiple modules or components. Similarly, keep functions and methods concise—each should ideally do one thing (Single Responsibility Principle).
- **Organize code into clear modules by feature or responsibility.** Group related functionality together and separate different concerns (UI vs. logic, logic vs. data access, etc.). This modular approach improves readability and makes it easier to locate and update code. Avoid monolithic or "god" classes; instead, break down functionality into cohesive classes or modules.
- **Ensure loose coupling and high cohesion.** Components should interact through well-defined interfaces or APIs, not through global variables. Minimize the interdependence between modules so that changes in one area have minimal impact elsewhere. High cohesion (each module focused on a single task) makes the codebase more maintainable.
- **Use clear, consistent importing and packaging.** Follow a logical project structure (e.g., domain-specific directories, feature folders, or layered architecture). Prefer relative imports for local modules within the project to keep dependencies explicit. Avoid cyclical dependencies between modules.
- **Minimize external dependencies.** Only include libraries or frameworks that are truly necessary. If the language’s standard library or existing project code can achieve something, use that instead of adding a new dependency. Every new library should be vetted for necessity, security, and bloat. **Avoid duplicating functionality** by importing multiple libraries that do the same thing.
- **Design for scalability and portability.** Structure code so it can grow: for example, in web apps separate frontend and backend concerns, and in microservice contexts keep services stateless where possible. In C/C++ projects, separate platform-specific code from portable logic (e.g., isolate hardware access in embedded systems behind abstraction layers). This ensures the codebase can scale or be adapted without major rewrites.
- **Keep context localized.** Write modules such that understanding them doesn’t require excessive jumping around the codebase. This is crucial for LLM comprehension and human maintainers alike—clear boundaries and localized context make it easier to load and reason about one component at a time.

## ✅ Code Quality & Best Practices

- **Write clean, readable code.** Use a consistent coding style and adhere to language-specific style guides (e.g., Airbnb Style Guide for JavaScript/TypeScript, or Google Style Guide for C++). Use proper indentation, spacing, and brace styles. Prefer descriptive names for variables, functions, and classes that reveal intent (avoid one-letter or ambiguous names). Code should be easily understood by other developers (and by LLMs) without needing excessive comments.
- **Prefer simplicity over cleverness.** Always favor simple, straightforward solutions over complicated or "clever" code. Do not introduce complex patterns or abstractions unless they are necessary for a clear benefit (such as a needed performance optimization or to adhere to a design requirement). If complexity is justified, document the reason. Otherwise, keep the design as simple as possible so that it’s easy to follow and maintain.
- **Avoid premature optimization.** Write correct and clear code first; optimize later _only_ if necessary and guided by profiling or evidence. Unnecessary micro-optimizations or convoluted hacks for speed can reduce clarity and introduce bugs. First ensure the code is straightforward and working, then optimize bottlenecks with measured data.
- **Use modern, safe language features.** Take advantage of the latest stable versions of the language for better safety and clarity (e.g., use ES6+ features in JavaScript/TypeScript, and use C++17 or newer for C++ code). Avoid outdated practices (like `var` in JS – use `const`/`let`, or archaic C++98-style code if C++20 is available). In C++, prefer smart pointers and RAII for memory management instead of raw pointers and manual `new`/`delete`. In C, prefer safer functions (`snprintf` over `sprintf`, etc.) and avoid unsafe functions like `gets`.
- **Enable strict type-checking and warnings.** In TypeScript or JavaScript, use strict mode and full type checks (no implicit any, etc.) to catch errors early. In C/C++, compile with high warning levels (`-Wall -Werror` for GCC/Clang) and treat warnings as errors. These practices enforce code quality by preventing common mistakes. Lint your code (ESLint, clang-tidy, etc.) and fix any issues they identify to adhere to best practices.
- **Ensure code is robust and handle errors gracefully.** Anticipate edge cases and incorrect usage. Always check return values and error codes (especially in C/C++ when calling system or library functions). In exceptions-capable languages, use try/catch blocks where appropriate to handle exceptions or propagate them with clear messages. Never ignore caught exceptions or silently continue on error; this is a silent failure waiting to happen. Robust code either handles the problem or fails fast with an informative error.
- **Maintain high cohesion and low repetition.** Adhere to the DRY (Don't Repeat Yourself) principle. If you find similar code in multiple places, refactor it into a common function or utility. Avoid copy-pasting code; instead, create reusable modules or use loops/abstraction to handle repetitive patterns. This reduces bugs and makes future changes easier (fixing a bug in one central place fixes it everywhere).
- **Write with maintainability in mind.** Code should be organized and written so that future developers (or an AI) can easily modify or extend it. This means clear structure, consistent patterns, and avoiding deep nesting that makes logic hard to follow. Apply principles like SOLID (for OOP: e.g., Single Responsibility, Open/Closed principle, etc.) or functional purity when relevant to keep modules decoupled and extensible. Always ask, “Will someone else understand this in a year?” and code accordingly.
- **Mind resource constraints for target environments.** If developing for web, be mindful of browser performance (don’t block the main thread, avoid memory leaks in long-running single-page apps). For Node.js, avoid blocking the event loop with heavy computations. For embedded C/C++ on microcontrollers, consider memory and CPU limitations: avoid dynamic memory allocation on small systems unless absolutely necessary (to prevent fragmentation and unpredictable failures), avoid recursion that could overflow the stack, and prefer deterministic loops over overly complex recursion or unbounded allocations. Optimize for low memory footprint and consistent performance if the environment requires it.

## 🧪 Testing & Coverage

- **Adopt a test-driven development approach (TDD).** Write tests for new functionality or bug fixes _before_ writing the implementation when possible. Follow the **Red-Green-Blue** cycle: start with a failing test (Red), then write code to make it pass (Green), then refactor the code for clarity and efficiency while tests remain green (Blue, i.e., Refactor). This ensures that code is written to fulfill tested requirements and remains clean after refactoring.
- **Maintain high test coverage (80% or more).** Aim for comprehensive coverage of the codebase through unit tests, integration tests, and end-to-end tests. Every feature or module should have tests covering typical cases, edge cases, and error conditions. High coverage (while not the only quality metric) helps catch regressions and gives confidence in code stability. Ensure that critical logic is not left untested.
- **Write unit tests for all new code.** For each function or class, create unit tests that verify its behavior in isolation (stubbing or mocking external dependencies as needed). Each unit test should include: at least one expected/normal scenario, important edge cases (extremes, empty inputs, error inputs), and failure modes (how the code behaves under invalid or exception conditions). This guarantees resilience of the code under different situations.
- **Include integration and end-to-end tests.** Beyond units, test how components work together. For web applications, use integration tests for API endpoints or data flows, and **E2E tests with Playwright** (or similar) to simulate real user interactions in a browser environment. For Electron apps, test the main process logic with Node.js based tests (e.g., using Jest or Mocha), and perform UI automation with tools like Playwright since the traditional Spectron is deprecated. Ensure the Electron app’s renderer process is tested in as real a scenario as possible (maybe via headless testing of the packaged app or via integration tests).
- **Use appropriate testing frameworks for each stack:**
  - _JavaScript/TypeScript (web & Node):_ Use **Jest** for unit and integration tests (it's a widely-used, robust testing framework). Use **Playwright** or **Cypress** for end-to-end testing of web UIs and APIs (these can automate browsers and even Electron).
  - _Electron:_ In addition to unit tests for business logic, use Playwright (which can launch Electron applications) or custom drivers to simulate user behavior in the desktop app. Focus on testing critical functionality in both main and renderer processes.
  - _C/C++ (Linux or embedded):_ Use best-in-class frameworks like **Unity** or **Ceedling** for C unit tests, and **Catch2** or **Google Test** for C++ tests. These frameworks facilitate assertions and test suites for low-level code. Where hardware is involved (microcontrollers), use simulators or hardware-in-the-loop tests; abstract hardware interactions behind interfaces so they can be mocked in tests.
- **Maintain a `tests/` directory mirroring the source structure.** Organize tests in a parallel structure to the code (e.g., if `src/util/math.c`, have `tests/util/math.test.c` or similar). This makes it easy to find tests for a given module. Keep tests deterministic and fast so they can run in CI frequently. Avoid tests that rely on external services or network if possible (use mocking or test doubles).
- **Continuously run and update tests.** Always run the full test suite after making changes. If you change code and a test fails, investigate whether the code is broken or the test needs updating (e.g., requirements changed). Never ignore failing tests. Update tests alongside code to reflect new expected behavior, and add new tests for any new bug found (to prevent regressions). Treat failing tests as non-negotiable issues to fix before considering a task done.
- **Strive for reliability in tests.** Tests themselves should be well-designed: no flaky tests (each test should produce the same result every run given the same code). Use proper setup/teardown for test environments to isolate test cases. Ensure tests clean up any temporary data they create. This all guarantees the test suite remains trustworthy and maintenance of the project remains efficient.

## 🔒 Security

- **Adhere to strict security best practices in all code.** Always follow industry security standards like the OWASP Top 10 for web applications and the most rigorous guidelines from NIST and CERT for general secure coding. If different standards conflict, **choose the most stringent approach**. Security is paramount and not optional.
- **Validate and sanitize all inputs.** Never trust user input or external data. Implement input validation on all interfaces (APIs, UI forms, command-line args, etc.), checking that inputs are of the expected type, format, and range. For web apps, prevent SQL injection by using parameterized queries or ORM frameworks; prevent XSS by escaping output properly and using context-appropriate encoding. In Electron, treat data from the renderer process as untrusted (use contextIsolation and sanitize messages passed via IPC).
- **Avoid known insecure functions and patterns.** In C/C++, do not use unsafe functions like `gets()` or `strcpy` on unchecked buffers; instead use size-bounded functions (`fgets`, `snprintf`, etc.) and perform buffer length checks. In JavaScript, never use `eval()` on untrusted strings, and avoid constructing HTML with string concatenation (use proper DOM APIs or frameworks to mitigate XSS). Use prepared statements or stored procedures for database access rather than string-building queries.
- **Use encryption and secure protocols.** Follow best practices for any cryptography: do not invent your own crypto algorithms. Use high-level libraries (like crypto APIs, OpenSSL, libsodium, etc.) and strong protocols. Ensure data in transit is over TLS, passwords are hashed with strong algorithms (e.g., bcrypt or Argon2, not plain MD5/SHA1), and sensitive data at rest is encrypted if applicable. In web contexts, enforce HTTPS and secure cookies; in mobile/embedded, use secure storage for credentials.
- **Apply the principle of least privilege.** When designing modules or deploying services, give each component the minimal access it needs. For example, if a process only needs read access to a file, don’t give it write. In code, avoid global mutable state that any part can modify—this can act like a global privilege. In Electron, disable remote modules and limit Node.js integration in renderer processes if not needed. On microcontrollers or low-level systems, avoid running in privileged modes unless required.
- **Keep security in mind for memory and resource management (C/C++).** Avoid buffer overflows, off-by-one errors, and memory leaks by careful coding and use of tools (enable address sanitizers, use static analysis). Free resources when they are no longer needed to prevent exhaustion attacks. Use stack canaries, fortify source, and other compiler security features when available. Also be mindful of integer overflows, format string vulnerabilities, and other low-level issues—validate lengths and types before using them in memory operations.
- **Protect against common web vulnerabilities.** Implement proper authentication and session management (never store plaintext passwords, use secure password hashing and salting). Implement access control checks on every protected resource on the server (don’t assume the UI alone will prevent an unauthorized action). Use anti-CSRF tokens for state-changing requests. Set secure HTTP headers (Content Security Policy, X-Frame-Options, etc.) to mitigate attacks. Regularly consult the OWASP Top 10 list of risks as a checklist ([OWASP Top Ten | OWASP Foundation](https://owasp.org/www-project-top-ten/#:~:text=The%20OWASP%20Top%2010%20is,security%20risks%20to%20web%20applications)) for web projects.
- **Maintain dependency and platform security.** Keep third-party libraries and frameworks up to date with security patches. Avoid dependencies that are unmaintained or have known vulnerabilities. In Node.js, run tools like `npm audit` to catch vulnerable packages. In C/C++, watch for updates in libraries (like OpenSSL) and for any CVEs that affect your components. Also, ensure the deployment environment is secure (server OS hardened, container images up to date, etc.).
- **Perform threat modeling and use secure design patterns.** For any significant feature, consider how it could be abused or attacked, and design with mitigations in mind (e.g., input validation, rate limiting, audit logging of important actions). Use secure design principles like defense-in-depth (multiple layers of defense), fail-safe defaults (deny by default), and avoid security by obscurity. If guidelines or standards provide multiple options, always implement the one with the fewer potential vulnerabilities (stricter checking, smaller attack surface).
- **Never expose sensitive data or secrets.** An LLM following these rules must ensure not to hard-code secrets (API keys, passwords) in code. Use configuration files or environment variables for secrets, and keep them out of source control. Sanitize any debug or error output so that it doesn’t leak stack traces or confidential info. When logging, omit or hash personal or sensitive data.

## 🚫 Anti-Patterns & Better Alternatives

_Avoid the following common anti-patterns; if you notice these in your approach, refactor to use the suggested better practices:_

- **Spaghetti Code (lack of structure)** – _Anti-pattern:_ Code that is tangled, with jumps in logic and no clear separation of concerns, making it hard to follow or maintain. **Better:** Structure your code with proper functions, modules, and layers. Use clear control flow and organize code by responsibility (e.g., UI vs business logic vs data access). Following design patterns like MVC or having distinct classes for distinct concerns brings order and clarity, eliminating spaghetti code.
- **God Objects/Monolithic Classes** – _Anti-pattern:_ A single class or module does too much (huge classes managing everything, or massive functions hundreds of lines long). **Better:** Apply the Single Responsibility Principle. Break large modules into smaller ones focused on specific tasks. Instead of one god class, have multiple classes each handling a piece of the functionality (with clear interfaces between them). This improves maintainability and testability. Use design patterns such as Facade (to provide a simple interface if needed) without internally having one class do everything.
- **Magic Numbers/Strings** – _Anti-pattern:_ Using unexplained numeric or string literals scattered through the code (e.g., `if (status == 37) {...}`). **Better:** Replace magic numbers with named constants or enums that describe their meaning (e.g., `MAX_RETRY_COUNT = 3`, or an enum for status codes). Use configuration files or clearly labeled constants for values that might change or that carry special meaning. This makes code self-documenting and easier to update.
- **Global State & Singletons Abuse** – _Anti-pattern:_ Excessive reliance on global variables or singletons for sharing state, which leads to hidden dependencies and makes testing and reasoning about code difficult. **Better:** Use dependency injection or pass needed parameters to functions and constructors. Keep state within appropriate scopes. If a singleton is truly needed (e.g., a global configuration), encapsulate it well and avoid making it mutable global state; prefer passing references to it rather than accessing it as a global. Aim for functions that rely only on their inputs, which makes behavior predictable.
- **Deep Nesting and Callback Hell** – _Anti-pattern:_ Code with multiple levels of nested loops or conditionals, or deeply nested callbacks in asynchronous code, leading to a "arrow-shaped" structure that is hard to read and maintain. **Better:** Refactor to reduce nesting – for example, use guard clauses/early returns to handle error cases instead of nesting an entire function inside an `if`. For async JavaScript, use `async/await` or Promise chains to flatten callback hell into a linear sequence of steps. Break complex logic into smaller helper functions to avoid deeply nested structures. The result should be flatter, more readable flow.
- **Duplicate Code (Not DRY)** – _Anti-pattern:_ Copy-pasting code in multiple places, which diverges over time or requires fixing the same bug in many locations. **Better:** Abstract common functionality into reusable functions or classes. Use loops or polymorphism to handle similar tasks instead of repeating code. Adhering to the DRY principle makes the codebase smaller and easier to maintain. If you find yourself copying code, stop and refactor.
- **Not Invented Here (Reinventing the Wheel)** – _Anti-pattern:_ Writing custom solutions for problems that are already solved by well-tested libraries or built-in language features (or refusing to use an appropriate library due to pride). **Better:** Leverage standard libraries and reputable frameworks whenever possible for common tasks (e.g., use built-in sorting, use a well-known JSON library instead of writing your own parser). This saves time and reduces bugs. However, balance this with the earlier rule of minimal dependencies – use established libraries, but avoid overly large ones for simple tasks.
- **Premature Optimization** – _Anti-pattern:_ Adding complex logic or micro-optimizations in anticipation of performance issues that are not proven, complicating the code without clear benefit. **Better:** First write simple, correct code (favoring clarity). Optimize only after identifying real performance bottlenecks via profiling. When optimization is needed, do it in targeted areas and comment the rationale. This ensures you’re solving real problems and the code remains maintainable.
- **Ignoring Errors (swallowing exceptions)** – _Anti-pattern:_ Catching exceptions only to log and continue, or ignoring function error codes (e.g., calling a function and not checking its return status), leading to hidden bugs or security issues. **Better:** Always handle errors explicitly. If an error is recoverable, handle it appropriately (retry, use fallback, or return an error up the stack). If not, fail fast and clearly (propagate the exception or return an error code after cleanup). At minimum, log enough information to diagnose issues. Never let errors silently pass unchecked, as they will surface later as larger problems.
- **Insecure Practices** – _Anti-pattern:_ Patterns like hard-coding credentials in code, disabling security checks for convenience, using obsolete cryptography, or not validating inputs (trusting user data). **Better:** Always code as if your software will be under attack. Remove any hard-coded secrets; use environment configs or secure vaults. Keep security checks (authentication, input validation) always on and up-to-date. Use modern, recommended security algorithms and protocols. Essentially, never sacrifice security for ease—follow the Security section guidelines strictly and treat any deviation as a bug.
- **Tight Coupling** – _Anti-pattern:_ Modules or classes that are overly dependent on the internals of each other, such that a change in one forces changes in others (violating modularity). **Better:** Program to interfaces, not implementations. Use dependency inversion where high-level modules define interfaces that lower-level modules implement. This way, components communicate through stable contracts. For example, instead of class A directly calling methods of class B and assuming its behavior, have B implement an interface that A uses — then B can be swapped or changed without affecting A. Loose coupling makes code more adaptable and testable.
- **Lack of Documentation (Self-Documenting Code Myth)** – _Anti-pattern:_ Assuming that code is self-explanatory and neglecting comments or docs entirely, which often leaves future maintainers (or yourself later) puzzled about the intent or reasoning. **Better:** Write clear comments for any code whose purpose or logic isn't immediately obvious. Especially document the "why" behind complex algorithms or decisions (e.g., performance trick, workaround for a bug, etc.). Maintain an updated README or developer guide for the project structure and setup. While code should be as clear as possible, a few well-placed comments and up-to-date documentation tremendously aid understanding.
- **Over-Engineering** – _Anti-pattern:_ Introducing too many patterns, abstractions, or generalizations for hypothetical future needs (e.g., building a plugin system for an app that has only one configuration). **Better:** Follow YAGNI ("You Aren't Gonna Need It") – implement what is required to meet the current requirements cleanly, and avoid adding complexity for speculative future use cases. Design the code to be extensible, but don’t add layers of indirection or abstractions until there's a real need. Simple, straightforward design is often more extensible than an overly complex one.

## 📚 Documentation & Explainability

- **Maintain up-to-date documentation.** Whenever features are added or changed, update relevant docs. This includes the main `README.md` (for how to build/run the project and high-level overview) and any design/architecture documents. If the project has a changelog or release notes, update those too. The documentation should accurately reflect the current state of the system so new contributors or an AI agent can quickly get up to speed on the project.
- **Write self-explanatory code, but comment where necessary.** The primary form of documentation is the code itself. Choose clear names and straightforward logic so that much of the code’s purpose is obvious from reading it. However, for any non-trivial or non-obvious logic, **add comments explaining the “why”.** For example, if you use a particular algorithm or workaround, include a brief comment (`// Reason: ...`) to explain the intent or the reason behind an implementation choice. This helps others understand the context and prevents misinterpretation of complex code.
- **Don't over-comment obvious things.** Avoid noise comments that state the obvious (`i++ // increment i`). Instead, focus comments on clarifying purpose, rationale, and implications. A good rule: if someone might ask "why was it done this way?" – answer that in a comment. If the code is doing something not immediately clear (like bit manipulation, intricate math, or a specific workaround), document it. Otherwise, trust your clean code and naming to be the documentation.
- **Provide usage examples and inline documentation for APIs.** If you write a module or library, include docstrings or comments on public functions/classes describing how to use them, their parameters, and return values. In TypeScript or JS, consider using JSDoc comments for functions. In C/C++, comments above functions (or Doxygen-style if the project uses it) are helpful. Additionally, writing tests acts as documentation by example – well-named test cases can show how code is supposed to be used.
- **Ensure consistency in documentation style.** Follow any project-specific guidelines for documentation (format of headers, markdown style, etc.). If none specified, just be consistent in tone and format. For example, if other modules have a top-of-file comment describing the module, do the same for new modules. Consistency makes it easier to navigate and trust documentation.
- **Document significant decisions and todos.** If during coding a notable design decision is made (e.g., choosing one algorithm over another for a reason), record it either in code comments or in a project log (and ideally an ADR if the project uses them). Clearly mark any temporary workarounds or "TODO" items in comments, with an explanation of what and _why_ something should be improved later. This helps ensure they are not forgotten and that the next person understands the context.

## 🧠 AI Behavior Rules (for LLM-based Development)

- **Never assume missing context – ask or verify.** If requirements or existing code context are unclear, do not guess or invent details. As an AI developer, you should seek clarification (through the provided interface or by requesting the relevant files/docs). Always prefer to get the accurate context rather than making assumptions that could be wrong.
- **Do not hallucinate functions or libraries.** Only use APIs, functions, or libraries that you are certain exist in the project or are standard/approved for use. If you think a helper might exist, double-check the project files or documentation. If a library is needed, it must be a well-known one that the project can include (and ideally already listed as a dependency). Never make up library names or function signatures. If unsure about an API, you must verify it or ask.
- **Confirm file paths and references.** When creating or modifying code, ensure that any import/module reference or file path actually exists or is being created as part of the task. For example, do not import a module that hasn’t been defined. Keep the project’s file structure in mind and update imports if files are moved. All references in code should resolve correctly in the context of the project.
- **Preserve existing code; modify with intent.** Do not delete or overwrite existing code unless it is part of the requirements (e.g., a refactoring task). Add new code or alter existing code in a way that integrates with what’s already there, respecting the original design. If a change is needed that affects existing functionality, be cautious and ensure tests cover it. The goal is to build on the project, not derail it.
- **Follow these guidelines unwaveringly.** These rules are designed to maintain high code quality, so the AI must adhere to them even if not explicitly reminded by a user. The AI should internalize these standards: always produce code that complies with the structure, style, testing, security, and documentation guidelines above. In summary, act as a diligent, experienced software engineer who never cuts corners on quality, security, or process – because doing so results in better software and easier collaboration between humans and AI.

## External Tools

### Context7

Use this tool to find detailed truthful information about libraries, their use, examples, and other specific details

**When to use:**

- Implementing any code that uses a library
- Choosing how to use a library
- Writing tests for code that uses a library
- Writing mocks for tests that would rely on a library
- Troubleshooting code that uses a library

**How to use:**

1. Identify which libraries you will be working with
2. Call resolve-library-id with the name of the library to get an ID for that specific libary
3. Call get-library-docs with the library ID and optionally a topic to search for (e.g. Mocking Prisma or Prisma Jest) and optionally a number of tokens to retreive. By default the tool will retreive 10000 tokens of documentation - scale this up when making subsequent calls to the tool for more information or details

### Sequential Thinking Tool

Use this tool to break down complex problems step by step.

**When to use:**

- Planning the PRD structure
- Analyzing complex features
- Evaluating technical decisions
- Breaking down development phases

**How to use:**

1. Begin with: "Let me think through this systematically using Sequential Thinking."
2. Explicitly call the tool before analyzing requirements, making technical recommendations, or planning development phases
3. Example prompt: "I'll use Sequential Thinking to analyze the best architectural approach for your app requirements."

### Filesystem Tool

Use this tool to interact with the local file system for reading, writing, editing, and managing files and folders.
IMPORTANT: complete paths must be specified - relative paths DO NOT WORK. Paths are generally going to be C:\Users\tophe\Documents\repos\<project directory>

**When to use:**

- Reading or modifying project files
- Creating or listing folders
- Writing configuration files or saving code
- Searching or browsing file structure

**How to use:**

1. Say what file/folder you need to interact with, e.g., "Let’s update the `env` file."
2. Use actions like `read_file`, `write_file`, `edit_file`, or `list_directory`.
3. Example prompt: "Write a new `.env` file in the project directory with updated database credentials."

### Playwright Tool

Use this tool to automate browser interactions and simulate user actions.

**When to use:**

- Testing UI workflows
- Validating frontend changes
- Simulating browser behavior
- Taking screenshots or running test scripts

**How to use:**

1. Describe the scenario, e.g., "Let’s simulate user login."
2. Use it to interact with frontend elements like buttons, fields, or pages.
3. Example prompt: "Use Playwright to test the login form on the staging site."

### Tavily Search Tool

Use this tool to find and summarize real-time information from the web.

**When to use:**

- Getting up-to-date answers
- Summarizing web content
- Answering questions based on current events

**How to use:**

1. Frame a question or topic you'd normally Google.
2. Specify if you want a short answer or detailed summary.
3. Example prompt: "Find and summarize recent benchmarks of GPT-4 Turbo."

### Brave Search Summarizer

Use this tool to obtain concise, AI-generated summaries of web search results, directly within Brave Search.

**When to use:**

- Quickly understanding the essence of a topic
- Reviewing multiple perspectives with cited sources
- Accessing real-time information with source transparency

**How to use:**

1. Enter your query in Brave Search.
2. If available, a summarized answer will appear at the top of the results page.
3. Review the summary and follow the cited links for more in-depth information.
4. Example prompt: "What happened in East Palestine, Ohio?"
