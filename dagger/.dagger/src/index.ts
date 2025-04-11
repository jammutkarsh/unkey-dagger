/**
	* A Dagger module for building unkey Projects using Go and Docker.
	*
*/
import { CacheVolume, Container, dag, Directory, File, func, object, Secret, Socket } from "@dagger.io/dagger";
import { GolangProject } from "./golang";
import { TSProject } from "./node";

export interface Project {
	ctr: Container;
	source: Directory;
	buildCache: CacheVolume;
	packageCache: CacheVolume
}

@object()
export class Dagger {

	/**
	* Sets up the Go project, builds it, and returns the binary file.
	* @param source - Directory containing the Go source code
	* @param buildDir - Directory to build the project
	* @param output - Name of the output binary file
	* @param mainFile - Path to the main Go file
	* @returns File - The built binary file
	* @description This function sets up the Go project, builds it, and returns the binary file.
	*/
	@func()
	buildGoProject(source: Directory, buildDir: string, output: string, mainFile: string): File {
		const project = new GolangProject(source);
		return project
			.setup(buildDir)
			.build(output, mainFile);
	}


	/**
	* Build the unkey API binary.
	*/
	@func()
	buildUnkeyAPI(source: Directory, buildDir: string): File {
		return this.buildGoProject(source, buildDir, "unkey-api", "./build/api/main.go");
	}


	/**
	* Build the unkey Health binary.
	*/
	@func()
	buildUnkeyHealth(source: Directory, buildDir: string): File {
		return this.buildGoProject(source, buildDir, "unkey-health", "./build/health/main.go");
	}

	/**
	* Build the unkey API TypeScript project.
	*/
	@func()
	buildTypeScript(source: Directory, buildDir: string, output: string): Directory {
		const project = new TSProject(source);
		return project
			.setup()
			.build(buildDir, output)
	}


	// TODO: Convert it into GolangProject Class
	/**
	* Build and release API and health binaries and Docker images using goreleaser.
	* @param gitDir - Directory containing the source code
	* @param socket - Socket to mount Docker
	* @param ghToken - GitHub token for authentication
	* @param dockerUser - Docker username for authentication
	* @param dockerSecret - Docker secret for authentication
	* @returns Directory - Directory containing the binary packages
	* @description This function uses goreleaser to build and release the Go project.
	*/
	@func()
	async release(gitDir: Directory, socket: Socket, ghToken: string, dockerUser: string, dockerSecret: Secret): Promise<Directory> {
		return dag.goreleaser()
			.withGoCache() // Enable Caching for Go Builds
			.withSource(gitDir) // to get info related to git tags
			.ctr() // Returning Container to mount Docker
			.withWorkdir("/mnt/go") // go.mod and goreleaser YAML is `go` dir
			.withUnixSocket("/var/run/docker.sock", socket)
			.withEnvVariable("GITHUB_TOKEN", ghToken) // Required by goreleaser, in case a package needs to be published
			.withSecretVariable("DOCKER_PAT", dockerSecret)
			.withExec(["sh", "-c", "echo $DOCKER_PAT | docker login --username " + dockerUser + " --password-stdin"])
			.withExec(["goreleaser", "release", "--clean"])
			.directory("/mnt/go/dist") // Export the Binary Packages
	}
}
