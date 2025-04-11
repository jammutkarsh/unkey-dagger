import { argument, CacheVolume, Container, dag, Directory, func, object } from "@dagger.io/dagger";
import { Project } from "./index";


@object()
export class TSProject implements Project {
	source: Directory
	ctr: Container
	buildCache: CacheVolume
	packageCache: CacheVolume;

	readonly projectDir = "/app/";

	constructor(
		@argument({ defaultPath: "/", ignore: ["**/*.go", "go.sum", "go.mod", "node_modules", "dagger"] })
		source: Directory
	) {
		this.source = source;
		this.ctr = dag.node().withPnpm().container()
		this.buildCache = new (CacheVolume) // avoid nil pointer dereference
		this.packageCache = dag.cacheVolume("npm-pkg-cache")
	}

	@func()
	setup(): TSProject {
		// Assuming all the package manager files are in the root directory
		this.ctr = this.ctr.withDirectory(this.projectDir, this.source)
			.withMountedCache("/root/.cache/pnpm", this.buildCache)
			// .withExec(["pnpm", "install", "--prod", "--prefer-frozen-lockfile"])
			.withExec(["pnpm", "install"])
		return this
	}

	@func()
	build(buildDir: string, output: string): Directory {
		const workdir = buildDir ? this.projectDir + buildDir : this.projectDir;
		return this.ctr
			.withWorkdir(workdir)
			.withExec(["pnpm", "build", "--verbosity", "10"])
			.directory(`/app/${output}`)
	}

	@func()
	test(output: string): Directory {
		console.log("Tests are not implemented yet", output);
		return dag.directory()
	}

	// Add TSProject-specific methods here
}