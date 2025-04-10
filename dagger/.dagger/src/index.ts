import { argument, Container, dag, Directory, File, func, object, Secret, Socket } from "@dagger.io/dagger"

@object()
class GoProject {
  source: Directory
  ctr: Container

  constructor(
    @argument({ defaultPath: "/", ignore: ["!**/*.go", "!go.sum", "!go.mod"] })
    source: Directory
  ) {
    this.source = source
    this.ctr = dag.container()
  }

  @func()
  container(version: string = "1.24"): GoProject {
    this.ctr = this.ctr.from(`docker.io/library/golang:${version}`)
      .withDirectory("/go/src", this.source)
      .withWorkdir("/go/src")
      .withExec(["go", "mod", "download"])
    return this
  }

  @func()
  build(output: string, mainFile: string): File {
    return this.ctr
      .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build-cache"))
      .withExec(["go", "build", "-o", output, mainFile])
      .file(`/go/src/${output}`)
  }
}

@object()
export class Dagger {
  @func()
  checkCachePath(): Container {
    return dag.container().from("alpine:latest")
      .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build-cache"))
      .terminal()
  }

  @func()
  buildUnkeyAPI(source: Directory): File {
    const project = new GoProject(source)
    return project.container().build("unkey-api", "./build/api/main.go")
  }

  @func()
  buildUnkeyHealth(source: Directory): File {
    const project = new GoProject(source)
    return project.container().build("unkey-health", "./build/health/main.go")
  }

  @func()
  async release(gitdir: Directory, dockersocket: Socket, ghtoken: string, dockerUser: string, dockerSecret: Secret): Promise<Directory> {
    var plainTxt = await dockerSecret.plaintext()
    return dag.goreleaser()
      .withGoCache() // Enable Caching for Go Builds
      .withSource(gitdir) // to get info related to git tags
      .ctr() // Returning Container to mount Docker
      .withWorkdir("/mnt/go") // go.mod and goreleaser YAML is `go` dir
      .withUnixSocket("/var/run/docker.sock", dockersocket)
      .withEnvVariable("GITHUB_TOKEN", ghtoken) // Required by goreleaser, in case a package needs to be published
      .withExec(["docker", "login", "-u", dockerUser, "--password-stdin"], { stdin: plainTxt })
      .withExec(["goreleaser", "release", "--clean"])
      .directory("/mnt/go/dist") // Export the Binary Packages
  }
}
