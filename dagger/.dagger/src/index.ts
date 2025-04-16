/**
	* A Dagger module for building unkey Projects using Go and Docker.
	*
*/
import { Container, Directory, File, dag, func, object } from "@dagger.io/dagger";
import { GolangProject } from "./golang";
import { TSProject } from "./node";

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

	@func()
	buildAndPublishUnkeyAPI(source: Directory, buildDir: string, buildFile: string, imageName: string, awsCreds: File, region: string, accountID: string, tags: string[]): Promise<string[]> {
		const project = new GolangProject(source);
		var binaryName = buildDir.replace(/\//g, "-");
		var finalContainer = project
			.setup(buildDir)
			.transferBinary(binaryName, buildFile);

		return Promise.all(
			tags.map(tag => {
				const fullImageName = `${imageName}:${tag}`;
				return dag.aws().ecrPush(awsCreds, region, accountID, fullImageName, finalContainer);
			})
		);
	}

	/**
	* Build the unkey API TypeScript project.
	*/
	@func()
	buildAndPublishTypeScript(source: Directory, buildDir: string): Container {
		const project = new TSProject(source);
		const buildDIr = project
			.setup()
			.build(buildDir)
		var finalContainer = dag.node().withPnpm().container()
			.withDirectory("/app", buildDIr)
			.withWorkdir("/app")
			.withExec(["pnpm", "install", "next@latest"])
			.withFile("/app/package.json", buildDIr.file("package.json"))
			.withEntrypoint(["pnpm", "run", "start"])

		return finalContainer
	}

}
