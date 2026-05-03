# InventoryCare — Foundation Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** C++17 project scaffold with CMake/vcpkg, portable PostgreSQL auto-launch, database schema migrations, and a minimal HTTP server responding to `/health`.

**Architecture:** Single binary reads `config.ini`, starts portable PostgreSQL from `pgsql/` via `pg_ctl`, connects via libpq, runs idempotent schema migrations, creates admin user on first run, then serves HTTP on port 8080. All paths are relative to the executable — no install step required.

**Tech Stack:** C++17, CMake 3.20+, vcpkg, cpp-httplib (header-only), libpq, libsodium (argon2 password hashing), nlohmann-json, Catch2 v3

---

## File Structure

```
InventoryCare/
├── CMakeLists.txt
├── vcpkg.json
├── config.ini.example
├── src/
│   ├── main.cpp                                  ← entry point, wires everything
│   ├── config.hpp / config.cpp                   ← INI config parser
│   ├── paths.hpp / paths.cpp                     ← exe-relative paths (cross-platform)
│   ├── db/
│   │   ├── connection.hpp / connection.cpp        ← libpq RAII wrapper
│   │   └── migrations.hpp / migrations.cpp       ← idempotent schema creation
│   ├── server/
│   │   └── http_server.hpp / http_server.cpp     ← cpp-httplib wrapper + routes
│   └── bootstrap/
│       ├── postgres_launcher.hpp / postgres_launcher.cpp  ← pg_ctl start/stop
│       └── firstrun.hpp / firstrun.cpp           ← first-run admin user setup
├── tests/
│   ├── test_config.cpp
│   ├── test_paths.cpp
│   ├── test_db.cpp           ← integration (requires PostgreSQL)
│   ├── test_migrations.cpp   ← integration
│   └── test_firstrun.cpp     ← integration
└── www/
    └── .gitkeep
```

---

## Task 1: CMake + vcpkg scaffold

**Files:**
- Create: `CMakeLists.txt`
- Create: `vcpkg.json`
- Create: `src/main.cpp` (stub)
- Create: `www/.gitkeep`
- Create: `config.ini.example`

- [ ] **Step 1: Create `vcpkg.json`**

```json
{
  "name": "inventorycare",
  "version": "1.0.0",
  "dependencies": [
    "cpp-httplib",
    "libpq",
    "nlohmann-json",
    "libsodium",
    "catch2"
  ]
}
```

- [ ] **Step 2: Create `CMakeLists.txt`**

```cmake
cmake_minimum_required(VERSION 3.20)
project(InventoryCare VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(unofficial-libpq CONFIG REQUIRED)
find_package(httplib CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(unofficial-sodium CONFIG REQUIRED)
find_package(Catch2 3 CONFIG REQUIRED)

set(IC_SOURCES
    src/config.cpp
    src/paths.cpp
    src/db/connection.cpp
    src/db/migrations.cpp
    src/server/http_server.cpp
    src/bootstrap/postgres_launcher.cpp
    src/bootstrap/firstrun.cpp
)

add_executable(inventorycare src/main.cpp ${IC_SOURCES})
target_include_directories(inventorycare PRIVATE src)
target_link_libraries(inventorycare PRIVATE
    unofficial::libpq::pq
    httplib::httplib
    nlohmann_json::nlohmann_json
    unofficial-sodium::sodium
)
if(WIN32)
    target_compile_definitions(inventorycare PRIVATE _WIN32_WINNT=0x0601)
endif()

# Tests
enable_testing()
add_executable(ic_tests
    tests/test_config.cpp
    tests/test_paths.cpp
    tests/test_db.cpp
    tests/test_migrations.cpp
    tests/test_firstrun.cpp
    ${IC_SOURCES}
)
target_include_directories(ic_tests PRIVATE src)
target_link_libraries(ic_tests PRIVATE
    unofficial::libpq::pq
    httplib::httplib
    nlohmann_json::nlohmann_json
    unofficial-sodium::sodium
    Catch2::Catch2WithMain
)
if(WIN32)
    target_compile_definitions(ic_tests PRIVATE _WIN32_WINNT=0x0601)
endif()

include(CTest)
include(Catch)
catch_discover_tests(ic_tests)
```

> **Note:** vcpkg CMake target names (`unofficial::libpq::pq`, `unofficial-sodium::sodium`) match vcpkg 2024+. If a target is not found, run `cmake --build build 2>&1 | grep "target"` — the error message usually shows the correct target name.

- [ ] **Step 3: Create stub `src/main.cpp`**

```cpp
#include <iostream>

int main() {
    std::cout << "InventoryCare starting...\n";
    return 0;
}
```

- [ ] **Step 4: Create `config.ini.example`**

```ini
[server]
port = 8080

[database]
host = localhost
port = 5432
name = inventorycare
user = inventorycare
password = inventorycare
```

- [ ] **Step 5: Create `www/.gitkeep`** (empty file)

- [ ] **Step 6: Build to verify scaffold**

```bash
# VCPKG_ROOT must be set to your vcpkg installation directory
cmake -B build -DCMAKE_TOOLCHAIN_FILE=$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake
cmake --build build
```

Windows:
```powershell
cmake -B build -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
cmake --build build
```

Expected: vcpkg downloads dependencies and build succeeds. Produces `build/inventorycare` (Linux/Mac) or `build/Debug/inventorycare.exe` (Windows).

- [ ] **Step 7: Commit**

```bash
git add CMakeLists.txt vcpkg.json config.ini.example "www/.gitkeep" src/main.cpp
git commit -m "chore: initialize CMake+vcpkg project scaffold"
```

---

## Task 2: Config parser

**Files:**
- Create: `src/config.hpp`
- Create: `src/config.cpp`
- Create: `tests/test_config.cpp`

- [ ] **Step 1: Write failing test — create `tests/test_config.cpp`**

```cpp
#include <catch2/catch_test_macros.hpp>
#include "config.hpp"
#include <fstream>
#include <cstdio>

TEST_CASE("load_config uses defaults when file missing", "[config]") {
    AppConfig cfg = load_config("__nonexistent_config__.ini");
    REQUIRE(cfg.server_port == 8080);
    REQUIRE(cfg.db_host == "localhost");
    REQUIRE(cfg.db_port == 5432);
    REQUIRE(cfg.db_name == "inventorycare");
}

TEST_CASE("load_config reads all values from file", "[config]") {
    const char* tmp = "tmp_test_cfg.ini";
    {
        std::ofstream f(tmp);
        f << "[server]\nport = 9090\n\n[database]\n"
          << "host = dbhost\nport = 5433\nname = mydb\n"
          << "user = myuser\npassword = mypass\n";
    }
    AppConfig cfg = load_config(tmp);
    std::remove(tmp);

    REQUIRE(cfg.server_port == 9090);
    REQUIRE(cfg.db_host == "dbhost");
    REQUIRE(cfg.db_port == 5433);
    REQUIRE(cfg.db_name == "mydb");
    REQUIRE(cfg.db_user == "myuser");
    REQUIRE(cfg.db_password == "mypass");
}

TEST_CASE("load_config ignores comments and blank lines", "[config]") {
    const char* tmp = "tmp_test_cfg2.ini";
    {
        std::ofstream f(tmp);
        f << "# top comment\n; also comment\n\n[server]\n# port\nport = 7777\n";
    }
    AppConfig cfg = load_config(tmp);
    std::remove(tmp);
    REQUIRE(cfg.server_port == 7777);
}
```

- [ ] **Step 2: Run — expect compile failure (`config.hpp` missing)**

```bash
cmake --build build
```

Expected: error about `config.hpp` not found.

- [ ] **Step 3: Create `src/config.hpp`**

```cpp
#pragma once
#include <string>

struct AppConfig {
    int         server_port    = 8080;
    std::string db_host        = "localhost";
    int         db_port        = 5432;
    std::string db_name        = "inventorycare";
    std::string db_user        = "inventorycare";
    std::string db_password    = "inventorycare";
};

AppConfig load_config(const std::string& path);
```

- [ ] **Step 4: Create `src/config.cpp`**

```cpp
#include "config.hpp"
#include <fstream>

static std::string trim(const std::string& s) {
    const char* ws = " \t\r\n";
    size_t start = s.find_first_not_of(ws);
    if (start == std::string::npos) return "";
    size_t end = s.find_last_not_of(ws);
    return s.substr(start, end - start + 1);
}

AppConfig load_config(const std::string& path) {
    AppConfig cfg;
    std::ifstream f(path);
    if (!f.is_open()) return cfg;

    std::string line, section;
    while (std::getline(f, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#' || line[0] == ';') continue;
        if (line.front() == '[') {
            auto close = line.find(']');
            if (close != std::string::npos)
                section = line.substr(1, close - 1);
            continue;
        }
        auto eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = trim(line.substr(0, eq));
        std::string val = trim(line.substr(eq + 1));

        if (section == "server") {
            if (key == "port") cfg.server_port = std::stoi(val);
        } else if (section == "database") {
            if      (key == "host")     cfg.db_host     = val;
            else if (key == "port")     cfg.db_port     = std::stoi(val);
            else if (key == "name")     cfg.db_name     = val;
            else if (key == "user")     cfg.db_user     = val;
            else if (key == "password") cfg.db_password = val;
        }
    }
    return cfg;
}
```

- [ ] **Step 5: Build and run config tests**

```bash
cmake --build build && ctest --test-dir build -R "\[config\]" -V
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config.hpp src/config.cpp tests/test_config.cpp
git commit -m "feat: add config.ini parser with sane defaults"
```

---

## Task 3: Executable path helpers

**Files:**
- Create: `src/paths.hpp`
- Create: `src/paths.cpp`
- Create: `tests/test_paths.cpp`

- [ ] **Step 1: Write failing test — create `tests/test_paths.cpp`**

```cpp
#include <catch2/catch_test_macros.hpp>
#include "paths.hpp"
#include <filesystem>

TEST_CASE("exe_dir returns an existing directory", "[paths]") {
    auto dir = paths::exe_dir();
    REQUIRE(std::filesystem::exists(dir));
    REQUIRE(std::filesystem::is_directory(dir));
}

TEST_CASE("derived paths are relative to exe_dir", "[paths]") {
    auto base = paths::exe_dir();
    REQUIRE(paths::pgsql_dir()   == base / "pgsql");
    REQUIRE(paths::data_dir()    == base / "data");
    REQUIRE(paths::logs_dir()    == base / "logs");
    REQUIRE(paths::www_dir()     == base / "www");
    REQUIRE(paths::config_file() == base / "config.ini");
}
```

- [ ] **Step 2: Create `src/paths.hpp`**

```cpp
#pragma once
#include <filesystem>

namespace paths {
    std::filesystem::path exe_dir();
    std::filesystem::path pgsql_dir();
    std::filesystem::path data_dir();
    std::filesystem::path logs_dir();
    std::filesystem::path www_dir();
    std::filesystem::path config_file();
}
```

- [ ] **Step 3: Create `src/paths.cpp`**

```cpp
#include "paths.hpp"
#include <filesystem>

#ifdef _WIN32
  #include <windows.h>
#elif __APPLE__
  #include <mach-o/dyld.h>
  #include <climits>
#endif

namespace paths {

std::filesystem::path exe_dir() {
#ifdef _WIN32
    wchar_t buf[MAX_PATH] = {};
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    return std::filesystem::path(buf).parent_path();
#elif __linux__
    return std::filesystem::canonical("/proc/self/exe").parent_path();
#elif __APPLE__
    char buf[PATH_MAX] = {};
    uint32_t size = sizeof(buf);
    _NSGetExecutablePath(buf, &size);
    return std::filesystem::canonical(buf).parent_path();
#else
    #error "Unsupported platform"
#endif
}

std::filesystem::path pgsql_dir()   { return exe_dir() / "pgsql"; }
std::filesystem::path data_dir()    { return exe_dir() / "data"; }
std::filesystem::path logs_dir()    { return exe_dir() / "logs"; }
std::filesystem::path www_dir()     { return exe_dir() / "www"; }
std::filesystem::path config_file() { return exe_dir() / "config.ini"; }

} // namespace paths
```

- [ ] **Step 4: Build and run paths tests**

```bash
cmake --build build && ctest --test-dir build -R "\[paths\]" -V
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/paths.hpp src/paths.cpp tests/test_paths.cpp
git commit -m "feat: add cross-platform exe-relative path helpers"
```

---

## Task 4: PostgreSQL portable launcher

**Files:**
- Create: `src/bootstrap/postgres_launcher.hpp`
- Create: `src/bootstrap/postgres_launcher.cpp`

No unit test — integration is verified indirectly in Task 6 (successful DB connection). Manual smoke test in Task 9.

- [ ] **Step 1: Create `src/bootstrap/postgres_launcher.hpp`**

```cpp
#pragma once
#include <string>

namespace bootstrap {

struct PgResult {
    bool        ok;
    std::string error;
};

PgResult pg_init_if_needed();         // initdb if data/ not initialized
PgResult pg_start();                  // pg_ctl start
PgResult pg_stop();                   // pg_ctl stop -m fast
bool     pg_wait_ready(int timeout_sec = 30);  // poll until connectable

} // namespace bootstrap
```

- [ ] **Step 2: Create `src/bootstrap/postgres_launcher.cpp`**

```cpp
#include "bootstrap/postgres_launcher.hpp"
#include "paths.hpp"
#include <filesystem>
#include <thread>
#include <chrono>
#include <cstdlib>
#include <libpq-fe.h>

namespace fs = std::filesystem;
namespace bootstrap {

static std::string pg_ctl() {
    auto bin = paths::pgsql_dir() / "bin";
#ifdef _WIN32
    return "\"" + (bin / "pg_ctl.exe").string() + "\"";
#else
    return "\"" + (bin / "pg_ctl").string() + "\"";
#endif
}

static std::string quoted(const fs::path& p) {
    return "\"" + p.string() + "\"";
}

PgResult pg_init_if_needed() {
    auto data = paths::data_dir();
    if (fs::exists(data / "PG_VERSION")) return {true, ""};

    fs::create_directories(data);
    std::string cmd = pg_ctl() + " initdb -D " + quoted(data)
                    + " -o \"--auth=trust --username=inventorycare\"";
    int rc = std::system(cmd.c_str());
    if (rc != 0) return {false, "initdb failed (code " + std::to_string(rc) + ")"};
    return {true, ""};
}

PgResult pg_start() {
    auto logs = paths::logs_dir();
    fs::create_directories(logs);
    std::string cmd = pg_ctl() + " start -D " + quoted(paths::data_dir())
                    + " -l " + quoted(logs / "postgres.log");
    int rc = std::system(cmd.c_str());
    if (rc != 0) return {false, "pg_ctl start failed (code " + std::to_string(rc) + ")"};
    return {true, ""};
}

PgResult pg_stop() {
    std::string cmd = pg_ctl() + " stop -D " + quoted(paths::data_dir()) + " -m fast";
    int rc = std::system(cmd.c_str());
    if (rc != 0) return {false, "pg_ctl stop failed (code " + std::to_string(rc) + ")"};
    return {true, ""};
}

bool pg_wait_ready(int timeout_sec) {
    auto deadline = std::chrono::steady_clock::now()
                  + std::chrono::seconds(timeout_sec);
    while (std::chrono::steady_clock::now() < deadline) {
        PGconn* c = PQconnectdb(
            "host=localhost port=5432 user=inventorycare connect_timeout=1");
        bool ready = (PQstatus(c) == CONNECTION_OK);
        PQfinish(c);
        if (ready) return true;
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
    return false;
}

} // namespace bootstrap
```

- [ ] **Step 3: Build (compile only)**

```bash
cmake --build build
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/bootstrap/postgres_launcher.hpp src/bootstrap/postgres_launcher.cpp
git commit -m "feat: add portable PostgreSQL launcher (pg_ctl wrapper)"
```

---

## Task 5: Database connection wrapper

**Files:**
- Create: `src/db/connection.hpp`
- Create: `src/db/connection.cpp`
- Create: `tests/test_db.cpp`

> **Prerequisite for integration tests:** PostgreSQL must be running with user `inventorycare` (trust auth). If using portable PostgreSQL, run Task 4's `pg_init_if_needed()` + `pg_start()` first, or run `createuser -s inventorycare` on a system PostgreSQL.

- [ ] **Step 1: Write failing test — create `tests/test_db.cpp`**

```cpp
#include <catch2/catch_test_macros.hpp>
#include "db/connection.hpp"

// Connects to 'postgres' maintenance DB (always exists)
static db::Config test_cfg() {
    return {"localhost", 5432, "postgres", "inventorycare", ""};
}

TEST_CASE("Connection succeeds with valid config", "[db][integration]") {
    db::Connection conn(test_cfg());
    REQUIRE(conn.ok());
}

TEST_CASE("Connection fails with unknown user", "[db][integration]") {
    db::Config bad{"localhost", 5432, "postgres", "nonexistent_user_xyz", "wrongpass"};
    db::Connection conn(bad);
    REQUIRE_FALSE(conn.ok());
    REQUIRE_FALSE(conn.last_error().empty());
}

TEST_CASE("exec runs SELECT 1", "[db][integration]") {
    db::Connection conn(test_cfg());
    REQUIRE(conn.ok());
    REQUIRE(conn.exec("SELECT 1"));
}
```

- [ ] **Step 2: Create `src/db/connection.hpp`**

```cpp
#pragma once
#include <string>
#include <libpq-fe.h>

namespace db {

struct Config {
    std::string host;
    int         port;
    std::string name;
    std::string user;
    std::string password;
};

class Connection {
public:
    explicit Connection(const Config& cfg);
    ~Connection();

    Connection(const Connection&)            = delete;
    Connection& operator=(const Connection&) = delete;

    bool        ok()         const;
    std::string last_error() const;
    PGconn*     get()              { return conn_; }

    bool exec(const std::string& sql);

private:
    PGconn* conn_ = nullptr;
};

} // namespace db
```

- [ ] **Step 3: Create `src/db/connection.cpp`**

```cpp
#include "db/connection.hpp"
#include <sstream>

namespace db {

Connection::Connection(const Config& cfg) {
    std::ostringstream cs;
    cs << "host="    << cfg.host
       << " port="   << cfg.port
       << " dbname=" << cfg.name
       << " user="   << cfg.user
       << " connect_timeout=5";
    if (!cfg.password.empty())
        cs << " password=" << cfg.password;
    conn_ = PQconnectdb(cs.str().c_str());
}

Connection::~Connection() {
    if (conn_) PQfinish(conn_);
}

bool Connection::ok() const {
    return conn_ && PQstatus(conn_) == CONNECTION_OK;
}

std::string Connection::last_error() const {
    if (!conn_) return "null connection";
    return PQerrorMessage(conn_);
}

bool Connection::exec(const std::string& sql) {
    PGresult* res = PQexec(conn_, sql.c_str());
    ExecStatusType s = PQresultStatus(res);
    PQclear(res);
    return s == PGRES_COMMAND_OK || s == PGRES_TUPLES_OK;
}

} // namespace db
```

- [ ] **Step 4: Build and run DB tests**

```bash
cmake --build build && ctest --test-dir build -R "\[db\]" -V
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/connection.hpp src/db/connection.cpp tests/test_db.cpp
git commit -m "feat: add libpq RAII connection wrapper"
```

---

## Task 6: Schema migrations

**Files:**
- Create: `src/db/migrations.hpp`
- Create: `src/db/migrations.cpp`
- Create: `tests/test_migrations.cpp`

- [ ] **Step 1: Write failing test — create `tests/test_migrations.cpp`**

```cpp
#include <catch2/catch_test_macros.hpp>
#include "db/connection.hpp"
#include "db/migrations.hpp"

// Uses a dedicated test DB — create it once:
//   createdb -U inventorycare inventorycare_test
static db::Connection test_conn() {
    return db::Connection({"localhost", 5432, "inventorycare_test", "inventorycare", ""});
}

TEST_CASE("run_migrations succeeds on empty DB", "[migrations][integration]") {
    auto conn = test_conn();
    REQUIRE(conn.ok());
    REQUIRE(db::run_migrations(conn));
}

TEST_CASE("run_migrations is idempotent", "[migrations][integration]") {
    auto conn = test_conn();
    REQUIRE(conn.ok());
    REQUIRE(db::run_migrations(conn));
    REQUIRE(db::run_migrations(conn));
}

TEST_CASE("all 5 tables exist after migration", "[migrations][integration]") {
    auto conn = test_conn();
    REQUIRE(conn.ok());
    REQUIRE(db::run_migrations(conn));

    PGresult* res = PQexec(conn.get(),
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema='public' "
        "AND table_name IN ('users','products','locations','inventory','movements')");
    REQUIRE(PQresultStatus(res) == PGRES_TUPLES_OK);
    int count = std::stoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    REQUIRE(count == 5);
}
```

- [ ] **Step 2: Create `src/db/migrations.hpp`**

```cpp
#pragma once
#include "db/connection.hpp"
#include <string>

namespace db {
    bool run_migrations(Connection& conn);
    bool create_database_if_needed(const std::string& db_name,
                                   const std::string& host, int port,
                                   const std::string& user);
}
```

- [ ] **Step 3: Create `src/db/migrations.cpp`**

```cpp
#include "db/migrations.hpp"
#include <sstream>

namespace db {

static const char* SCHEMA = R"SQL(
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'operator'
                      CHECK (role IN ('admin','operator')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    sku         TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    category    TEXT,
    unit        TEXT NOT NULL DEFAULT 'pcs',
    min_stock   INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id          SERIAL PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
    product_id  INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS movements (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    type        TEXT    NOT NULL CHECK (type IN ('IN','OUT','TRANSFER')),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    reference   TEXT,
    notes       TEXT,
    user_id     INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
)SQL";

bool run_migrations(Connection& conn) {
    return conn.exec(SCHEMA);
}

bool create_database_if_needed(const std::string& db_name,
                                const std::string& host, int port,
                                const std::string& user) {
    std::ostringstream cs;
    cs << "host=" << host << " port=" << port
       << " dbname=postgres user=" << user << " connect_timeout=5";
    PGconn* maint = PQconnectdb(cs.str().c_str());
    if (PQstatus(maint) != CONNECTION_OK) { PQfinish(maint); return false; }

    std::string check = "SELECT 1 FROM pg_database WHERE datname='" + db_name + "'";
    PGresult* res = PQexec(maint, check.c_str());
    bool exists = (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) > 0);
    PQclear(res);

    if (!exists) {
        std::string sql = "CREATE DATABASE " + db_name + " OWNER " + user;
        PGresult* cr = PQexec(maint, sql.c_str());
        exists = (PQresultStatus(cr) == PGRES_COMMAND_OK);
        PQclear(cr);
    }
    PQfinish(maint);
    return exists;
}

} // namespace db
```

- [ ] **Step 4: Create test database (run once)**

```bash
createdb -U inventorycare inventorycare_test
```

- [ ] **Step 5: Build and run migration tests**

```bash
cmake --build build && ctest --test-dir build -R "\[migrations\]" -V
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations.hpp src/db/migrations.cpp tests/test_migrations.cpp
git commit -m "feat: add idempotent schema migrations for all 5 tables"
```

---

## Task 7: First-run admin setup

**Files:**
- Create: `src/bootstrap/firstrun.hpp`
- Create: `src/bootstrap/firstrun.cpp`
- Create: `tests/test_firstrun.cpp`

- [ ] **Step 1: Write failing test — create `tests/test_firstrun.cpp`**

```cpp
#include <catch2/catch_test_macros.hpp>
#include "db/connection.hpp"
#include "db/migrations.hpp"
#include "bootstrap/firstrun.hpp"

static db::Connection test_conn() {
    return db::Connection({"localhost", 5432, "inventorycare_test", "inventorycare", ""});
}

TEST_CASE("is_first_run returns true on empty users table", "[firstrun][integration]") {
    auto conn = test_conn();
    REQUIRE(conn.ok());
    db::run_migrations(conn);
    conn.exec("TRUNCATE users RESTART IDENTITY CASCADE");
    REQUIRE(bootstrap::is_first_run(conn));
}

TEST_CASE("setup_first_run creates admin user with role admin", "[firstrun][integration]") {
    auto conn = test_conn();
    REQUIRE(conn.ok());
    db::run_migrations(conn);
    conn.exec("TRUNCATE users RESTART IDENTITY CASCADE");

    REQUIRE(bootstrap::setup_first_run(conn));

    PGresult* res = PQexec(conn.get(),
        "SELECT username, role FROM users WHERE username='admin'");
    REQUIRE(PQresultStatus(res) == PGRES_TUPLES_OK);
    REQUIRE(PQntuples(res) == 1);
    REQUIRE(std::string(PQgetvalue(res, 0, 1)) == "admin");
    PQclear(res);
}

TEST_CASE("is_first_run returns false after setup", "[firstrun][integration]") {
    auto conn = test_conn();
    REQUIRE(conn.ok());
    db::run_migrations(conn);
    conn.exec("TRUNCATE users RESTART IDENTITY CASCADE");
    bootstrap::setup_first_run(conn);
    REQUIRE_FALSE(bootstrap::is_first_run(conn));
}
```

- [ ] **Step 2: Create `src/bootstrap/firstrun.hpp`**

```cpp
#pragma once
#include "db/connection.hpp"

namespace bootstrap {
    bool is_first_run(db::Connection& conn);
    bool setup_first_run(db::Connection& conn);
}
```

- [ ] **Step 3: Create `src/bootstrap/firstrun.cpp`**

```cpp
#include "bootstrap/firstrun.hpp"
#include <sodium.h>
#include <array>
#include <string>

namespace bootstrap {

bool is_first_run(db::Connection& conn) {
    PGresult* res = PQexec(conn.get(), "SELECT COUNT(*) FROM users");
    if (PQresultStatus(res) != PGRES_TUPLES_OK) { PQclear(res); return true; }
    int count = std::stoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    return count == 0;
}

bool setup_first_run(db::Connection& conn) {
    if (sodium_init() < 0) return false;

    const std::string password = "admin123";
    std::array<char, crypto_pwhash_STRBYTES> hash{};
    if (crypto_pwhash_str(
            hash.data(),
            password.c_str(), password.size(),
            crypto_pwhash_OPSLIMIT_INTERACTIVE,
            crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0) {
        return false;
    }

    const char* params[2] = {"admin", hash.data()};
    PGresult* res = PQexecParams(conn.get(),
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
        2, nullptr, params, nullptr, nullptr, 0);
    bool ok = (PQresultStatus(res) == PGRES_COMMAND_OK);
    PQclear(res);
    return ok;
}

} // namespace bootstrap
```

- [ ] **Step 4: Build and run firstrun tests**

```bash
cmake --build build && ctest --test-dir build -R "\[firstrun\]" -V
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bootstrap/firstrun.hpp src/bootstrap/firstrun.cpp tests/test_firstrun.cpp
git commit -m "feat: add first-run detection and admin user creation (argon2)"
```

---

## Task 8: HTTP server skeleton

**Files:**
- Create: `src/server/http_server.hpp`
- Create: `src/server/http_server.cpp`

- [ ] **Step 1: Create `src/server/http_server.hpp`**

```cpp
#pragma once
#include "db/connection.hpp"
#include <httplib.h>

namespace server {

class HttpServer {
public:
    HttpServer(int port, db::Connection& db);
    void start();  // blocks until stop()
    void stop();

private:
    int              port_;
    db::Connection&  db_;
    httplib::Server  svr_;

    void register_routes();
};

} // namespace server
```

- [ ] **Step 2: Create `src/server/http_server.cpp`**

```cpp
#include "server/http_server.hpp"
#include <nlohmann/json.hpp>

namespace server {

HttpServer::HttpServer(int port, db::Connection& db)
    : port_(port), db_(db) {
    register_routes();
}

void HttpServer::register_routes() {
    svr_.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        nlohmann::json body = {{"status", "ok"}};
        res.set_content(body.dump(), "application/json");
    });

    svr_.set_error_handler([](const httplib::Request&, httplib::Response& res) {
        nlohmann::json body = {{"error", "not found"}};
        res.set_content(body.dump(), "application/json");
    });
}

void HttpServer::start() { svr_.listen("0.0.0.0", port_); }
void HttpServer::stop()  { svr_.stop(); }

} // namespace server
```

- [ ] **Step 3: Build**

```bash
cmake --build build
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/http_server.hpp src/server/http_server.cpp
git commit -m "feat: add HTTP server skeleton with /health endpoint"
```

---

## Task 9: Main entry point — wire everything

**Files:**
- Modify: `src/main.cpp`

- [ ] **Step 1: Replace stub `src/main.cpp` with full bootstrap sequence**

```cpp
#include <iostream>
#include <csignal>
#include <atomic>
#include <thread>
#include <chrono>

#include "config.hpp"
#include "paths.hpp"
#include "db/connection.hpp"
#include "db/migrations.hpp"
#include "server/http_server.hpp"
#include "bootstrap/postgres_launcher.hpp"
#include "bootstrap/firstrun.hpp"

static std::atomic<bool> g_running{true};

static void handle_signal(int) { g_running = false; }

int main() {
    std::signal(SIGINT,  handle_signal);
    std::signal(SIGTERM, handle_signal);

    AppConfig cfg = load_config(paths::config_file().string());

    // 1. Start portable PostgreSQL
    std::cout << "[boot] Initializing PostgreSQL data directory...\n";
    auto init = bootstrap::pg_init_if_needed();
    if (!init.ok) { std::cerr << "[boot] initdb: " << init.error << "\n"; return 1; }

    auto start = bootstrap::pg_start();
    if (!start.ok) { std::cerr << "[boot] pg_start: " << start.error << "\n"; return 1; }

    std::cout << "[boot] Waiting for PostgreSQL to accept connections...\n";
    if (!bootstrap::pg_wait_ready(30)) {
        std::cerr << "[boot] PostgreSQL did not become ready within 30s\n"; return 1;
    }

    // 2. Create application database if not exists
    std::cout << "[boot] Creating database if needed...\n";
    if (!db::create_database_if_needed(cfg.db_name, cfg.db_host,
                                        cfg.db_port, cfg.db_user)) {
        std::cerr << "[boot] Failed to create database '" << cfg.db_name << "'\n";
        return 1;
    }

    // 3. Connect
    db::Config dbcfg{cfg.db_host, cfg.db_port,
                     cfg.db_name, cfg.db_user, cfg.db_password};
    db::Connection conn(dbcfg);
    if (!conn.ok()) {
        std::cerr << "[boot] DB connection failed: " << conn.last_error() << "\n";
        return 1;
    }

    // 4. Migrations
    std::cout << "[boot] Running schema migrations...\n";
    if (!db::run_migrations(conn)) {
        std::cerr << "[boot] Migration failed: " << conn.last_error() << "\n";
        return 1;
    }

    // 5. First run
    if (bootstrap::is_first_run(conn)) {
        std::cout << "[boot] First run — creating admin user (admin / admin123)\n";
        if (!bootstrap::setup_first_run(conn)) {
            std::cerr << "[boot] Failed to create admin user\n"; return 1;
        }
    }

    // 6. HTTP server
    std::cout << "[boot] Listening on http://0.0.0.0:" << cfg.server_port << "\n";
    server::HttpServer http(cfg.server_port, conn);

    std::thread watcher([&]() {
        while (g_running)
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        http.stop();
    });

    http.start();   // blocks until stop() called
    watcher.join();

    std::cout << "[boot] Stopping PostgreSQL...\n";
    bootstrap::pg_stop();
    std::cout << "[boot] Shutdown complete.\n";
    return 0;
}
```

- [ ] **Step 2: Build**

```bash
cmake --build build
```

Expected: compiles without errors.

- [ ] **Step 3: Manual smoke test**

> Requires `pgsql/` portable binaries copied next to the built executable. Download PostgreSQL portable for your OS and extract into `build/pgsql/` (Windows) or the directory containing the Linux binary.

```bash
# Run the binary
./build/inventorycare

# Expected output:
# [boot] Initializing PostgreSQL data directory...
# [boot] Waiting for PostgreSQL to accept connections...
# [boot] Creating database if needed...
# [boot] Running schema migrations...
# [boot] First run — creating admin user (admin / admin123)
# [boot] Listening on http://0.0.0.0:8080

# In a second terminal:
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# Press Ctrl+C — expected:
# [boot] Stopping PostgreSQL...
# [boot] Shutdown complete.
```

- [ ] **Step 4: Commit**

```bash
git add src/main.cpp
git commit -m "feat: wire full bootstrap sequence in main (postgres+db+migrations+http)"
```

---

## Plan 1 Complete

Running `ctest --test-dir build -V` should show 11 tests passing (3 config + 2 paths + 3 db + 3 migrations... wait, test_firstrun is 3 = total 14). Fix: 3+2+3+3+3 = 14 tests total.

```bash
ctest --test-dir build -V
# Expected: 14/14 tests passed
```

**Next:** Plan 2 — Backend API (auth, products, locations, inventory, movements, reports).
