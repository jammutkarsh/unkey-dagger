import { argument, CacheVolume, Container, dag, Directory, File, func, object, Platform } from "@dagger.io/dagger";

@object()
export class GolangProject {
	source: Directory
	ctr: Container
	buildCache: CacheVolume
	packageCache: CacheVolume;

	readonly projectDir = "/go/src/";

	constructor(
		@argument({ defaultPath: "/", ignore: ["!**/*.go", "!go.sum", "!go.mod", ".dagger"] })
		source: Directory
	) {
		this.source = source; // Copy the entire monorepo to get the .git directory
		this.ctr = dag.container().from("golang:1.24")
		this.buildCache = dag.cacheVolume("go-build-cache") // ~/.cache/go-build (Linux)
		this.packageCache = dag.cacheVolume("go-pkg-cache")
	}


	@func()
	setup(buildDir: string): GolangProject {
		const workdir = buildDir ? this.projectDir + buildDir : this.projectDir;
		// Assuming all the package manager files are in the root directory
		this.ctr = this.ctr.withDirectory(this.projectDir, this.source)
			.withWorkdir(workdir)
			.withMountedCache("/go/pkg/mod", this.packageCache)
			.withExec(["go", "mod", "download"])
		return this
	}

	@func()
	build(output: string, mainFile: string, buildFlags: string[] = []): File {
		// Prepare the build command
		const buildCmd = ["go", "build"];
		const outputDir = `/go/src/${output}`

		// Add any build flags if they were provided
		if (buildFlags.length > 0) {
			buildCmd.push(...buildFlags);
		}

		// Add the output file and main file to the command
		buildCmd.push("-o", outputDir, mainFile);

		return this.ctr
			.withMountedCache("/root/.cache/go-build", this.buildCache)
			.withEnvVariable("GOOS", "linux")
			.withEnvVariable("GOARCH", "arm64")
			.withExec(buildCmd)
			.file(outputDir)
	}

	@func()
	test(output: string): Directory {
		console.log("Tests are not implemented yet", output);
		return dag.directory()
	}

	@func()
	transferBinary(output: string, mainFile: string): Container {
		const finalImage = dag
			.container({ platform: 'linux/arm64' as Platform })
			.from("alpine")
			.withFile(`/bin/${output}`, this.build(output, mainFile))
			.withEntrypoint([`/bin/${output}`])

		return finalImage
	}
}
