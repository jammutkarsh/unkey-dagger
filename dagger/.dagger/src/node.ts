import { argument, CacheVolume, Container, dag, Directory, File, func, object } from "@dagger.io/dagger";


@object()
export class TSProject {
	source: Directory
	ctr: Container
	packageCache: CacheVolume;

	readonly projectDir = "/app/";

	constructor(
		@argument({ defaultPath: "/", ignore: ["**/*.go", "go.sum", "go.mod", "node_modules", "dagger"] })
		source: Directory
	) {
		this.source = source;
		this.ctr = dag.node().withPnpm().container()
		this.packageCache = dag.cacheVolume("npm-pkg-cache")
	}

	@func()
	setup(): TSProject {
		// Assuming all the package manager files are in the root directory
		this.ctr = this.ctr.withWorkdir(this.projectDir)
			.withDirectory(this.projectDir, this.source)
			.withMountedCache("/root/.cache/pnpm", this.packageCache)
			// .withExec(["pnpm", "install", "--prod", "--prefer-frozen-lockfile"])
			.withExec(["pnpm", "install"])
			.withExec(["npm", "install", "-g", "workerd@latest", "pnpm"])
		return this
	}

	@func()
	build(buildDir: string): File {
		const workdir = buildDir ? this.projectDir + buildDir : this.projectDir;
		return this.ctr
			.withWorkdir(workdir)
			.withExec(["pnpm", "wrangler", "deploy", "--dry-run"])
			.withExec(["pnpm", "workerd", "compile", "./worker.capnp", ">", "unkey"])
			.file(`/app/unkey`)
	}

	@func()
	test(output: string): Directory {
		console.log("Tests are not implemented yet", output);
		return dag.directory()
	}

	// Add TSProject-specific methods here
}