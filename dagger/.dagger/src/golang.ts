import { argument, CacheVolume, Container, dag, Directory, File, func, object } from "@dagger.io/dagger";

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
	build(output: string, mainFile: string): File {
		return this.ctr
			.withMountedCache("/root/.cache/go-build", this.buildCache)
			.withExec(["go", "build", "-o", output, mainFile])
			.file(`/go/src/${output}`)
	}

	@func()
	test(output: string): Directory {
		console.log("Tests are not implemented yet", output);
		return dag.directory()
	}

	@func()
	buildDockerImage(imageName: string, output: string, mainFile: string, awsCreds: File, region: string, accountID: string, tags: string[]): Promise<string[]> {
		const OCIImage = dag
			.container()
			.from("alpine")
			.withFile(`/bin/${output}`, this.build(output, mainFile))
			.withEntrypoint([`/bin/${output}`])


		return Promise.all(
			tags.map(tag => {
				const fullImageName = `${imageName}:${tag}`;
				return dag.aws().ecrPush(awsCreds, region, accountID, fullImageName, OCIImage);
			})
		);
	}
}
