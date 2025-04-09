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
import { Container, dag, Directory, File, func, object, Socket } from "@dagger.io/dagger"

@object()
export class Dagger {
  @func()
  checkCachePath(): Container {
    return dag.container().from("alpine:latest")
      .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build-cache"))
      .terminal()
  }

  @func()
  setupGoContainer(source: Directory): Container {
    return dag.container().from("docker.io/library/golang:1.24")
      .withDirectory("/go/src", source, { include: ["go.mod", "go.sum"] })
      .withWorkdir("/go/src")
      .withExec(["go", "mod", "download"])
  }

  /**
  * Has API and QuotaCheck sub-commands
  */
  @func()
  buildUnkeyAPI(source: Directory): File {
    return this.setupGoContainer(source)
      .withDirectory("/go/src", source, { exclude: ["go.mod", "go.sum"] })
      .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build-cache"))
      .withExec(["go", "build", "-o", "unkey-api", "./build/api/main.go"])
      .file("/go/src/unkey-api")
  }

  /**
  * Has Health and QuotaCheck sub-commands
  */
  @func()
  buildUnkeyHealth(source: Directory): File {
    return this.setupGoContainer(source)
      .withDirectory("/go/src", source, { exclude: ["go.mod", "go.sum"] })
      .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build-cache"))
      .withExec(["go", "build", "-o", "unkey-health", "./build/health/main.go"])
      .file("/go/src/unkey-health")
  }

  @func()
  release(gitdir: Directory, dockersocket: Socket): Directory {
    dag.container()
    return dag.goreleaser()
      .withGoCache() // Enable Caching for Go Builds
      .withSource(gitdir) // to get info related to git tags

      .ctr() // Returning Container to mount Docker

      .withWorkdir("/mnt/go") // go.mod and goreleaser YAML is `go` dir
      .withUnixSocket("/var/run/docker.sock", dockersocket)

      .withExec(["goreleaser", "release", "--snapshot"])
      .directory("/mnt/go/dist") // Export the Binary Packages
  }
}
