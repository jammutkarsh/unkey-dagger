import { argument, CacheVolume, Container, dag, Directory, func, object, Platform } from "@dagger.io/dagger";

@object()
export class TSProject {
	source: Directory;
	ctr: Container;
	pnpmStoreCache: CacheVolume;
	nodeModulesCache: CacheVolume;

	readonly projectDir = "/app/";

	constructor(
		@argument({
			defaultPath: "/",
			ignore: [
				"**/*.go",
				"go.sum",
				"go.mod",
				"node_modules",
				".dagger",
				"dist",
				"build",
				"*.log",
				".turbo"
			]
		})
		source: Directory
	) {
		this.source = source;
		this.pnpmStoreCache = dag.cacheVolume("pnpm-store-vn");
		this.nodeModulesCache = dag.cacheVolume("node-modules-vn");
		this.ctr = dag.node({version: "23"})
			.withPnpm()
			.container()
	}

	@func()
	setup(buildDir?: string): TSProject {
		// mount the caches
		this.ctr = this.ctr
			.withMountedCache("/root/.local/share/pnpm/store", this.pnpmStoreCache)
			.withMountedCache(`${this.projectDir}/node_modules`, this.nodeModulesCache);

		// Add minimal files needed for pnpm install
		this.ctr = this.ctr
			.withWorkdir(this.projectDir)
			.withFile("pnpm-lock.yaml", this.source.file("pnpm-lock.yaml"))
			.withFile("pnpm-workspace.yaml", this.source.file("pnpm-workspace.yaml"))
			.withFile("package.json", this.source.file(`${buildDir}/package.json`))
			.withExec(["pnpm", "install", "--fix-lockfile"]);

		// Add the full source code
		this.ctr = this.ctr
			.withDirectory(this.projectDir, this.source, {
				exclude: ["node_modules", ".next", "dist", "build", "*.log", ".turbo"]
			});

		return this;
	}

	@func()
	build(buildDir: string, buildCommand: string[] = ["pnpm", "run", "build"]): Directory {
		const workdir = `${this.projectDir}${buildDir}`;
		return this.ctr
			.withWorkdir(workdir)
			.withExec(["pnpm", "install"]) // App specific dependencies
			.withExec(buildCommand)
			.directory(workdir);
	}

	@func()
	test(buildDir: string, testCommand: string[] = ["pnpm", "test"]): Promise<string> {
		const workdir = `${this.projectDir}${buildDir}`;
		return this.ctr
			.withWorkdir(workdir)
			.withExec(testCommand)
			.stdout();
	}

	@func()
	transferApp(buildDir: string, entrypoint: string[]): Container {
		const builtDir = this.build(buildDir);
		return dag.container({ platform: "linux/arm64" as Platform })
			.from("node:alpine")
			.withDirectory("/app", builtDir)
			.withWorkdir("/app")
			.withEntrypoint(entrypoint);
	}
}