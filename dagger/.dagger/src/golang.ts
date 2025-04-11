import { argument, CacheVolume, Container, dag, Directory, File, func, object } from "@dagger.io/dagger";
import { Project } from "./index";

@object()
export class GolangProject implements Project {
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
		this.ctr = dag.goreleaser({ version: "latest" }).ctr();
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

	// Add Golang specific methods here
}







// @object()
// class GoProject {
//   source: Directory
//   ctr: Container

//   constructor(
//     @argument({ defaultPath: "/", ignore: ["!**/*.go", "!go.sum", "!go.mod"] })
//     source: Directory
//   ) {
//     this.source = source
//     this.ctr = dag.container()
//   }

//   @func()
//   configureContainer(version: string = "1.24"): GoProject {
//     this.ctr = this.ctr.from(`docker.io/library/golang:${version}`)
//       .withDirectory("/go/src", this.source)
//       .withWorkdir("/go/src")
//       .withExec(["go", "mod", "download"])
//     return this
//   }

//   @func()
//   build(output: string, mainFile: string): File {
//     return this.ctr
//       .withMountedCache("/root/.cache/go-build", dag.cacheVolume("go-build-cache"))
//       .withExec(["go", "build", "-o", output, mainFile])
//       .file(`/go/src/${output}`)
//   }
// }
