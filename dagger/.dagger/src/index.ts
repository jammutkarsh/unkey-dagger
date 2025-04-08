/**
 * A generated module for Dagger functions
 *
 * This module has been generated via dagger init and serves as a reference to
 * basic module structure as you get started with Dagger.
 *
 * Two functions have been pre-created. You can modify, delete, or add to them,
 * as needed. They demonstrate usage of arguments and return types using simple
 * echo and grep commands. The functions can be called from the dagger CLI or
 * from one of the SDKs.
 *
 * The first line in this comment block is a short description line and the
 * rest is a long description with more detail on the module's purpose or usage,
 * if appropriate. All modules should have a short description.
 */
import { Container, dag, Directory, File, func, object } from "@dagger.io/dagger"

@object()
export class Dagger {
  baseContainerNode: Container

  // Dependency Layer
  @func()
  setupGoContainer(source: Directory): Container {
    return dag.container().from("docker.io/library/golang:1.24")
      .withDirectory("/go/src", source, { include: ["go.mod", "go.sum"] })
      .withWorkdir("/go/src")
      .withExec(["go", "mod", "download"])
  }

  // Source Code Layer
  @func()
  copyGoFiles(source: Directory): Container {
    return this.setupGoContainer(source)
      .withDirectory("/go/src", source, { exclude: ["go.mod", "go.sum"] })
  }


  // Build Layer
  /**
  * Has API and QuotaCheck sub-commands
  */
  @func()
  buildUnkeyAPI(source: Directory): File {
    return this.copyGoFiles(source)
      .withExec(["go", "build", "-o", "unkey-api", "./build/api/main.go"])
      .file("/go/src/unkey-api")
  }

  /**
  * Has Health and QuotaCheck sub-commands
  */
  @func()
  buildUnkeyHealth(source: Directory): File {
    return this.copyGoFiles(source)
      .withExec(["go", "build", "-o", "unkey-health", "./build/health/main.go"])
      .file("/go/src/unkey-health")
  }
}
