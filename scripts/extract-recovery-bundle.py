"""Extract a decrypted ElectraGuard bundle into an empty recovery directory."""

import argparse
from pathlib import Path, PurePosixPath
import tarfile


def extract(bundle, destination):
    if not destination.is_dir() or any(destination.iterdir()):
        raise ValueError("The recovery destination must be an empty directory.")
    with tarfile.open(bundle, "r:") as archive:
        seen = set()
        members = archive.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or path in seen:
                raise ValueError("Unexpected bundle member.")
            if path == PurePosixPath("database.pgdump"):
                allowed = member.isfile() and member.size > 0
            elif path == PurePosixPath("private-media"):
                allowed = member.isdir()
            elif path.parts and path.parts[0] == "private-media":
                allowed = member.isfile() or member.isdir()
            else:
                allowed = False
            if not allowed:
                raise ValueError("Unexpected bundle member.")
            seen.add(path)
        if not {PurePosixPath("database.pgdump"), PurePosixPath("private-media")} <= seen:
            raise ValueError("The bundle must contain a database dump and private media.")
        archive.extractall(destination, members=members, filter="data")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    try:
        extract(args.bundle, args.destination)
    except (OSError, ValueError, tarfile.TarError) as error:
        parser.exit(2, f"Could not extract the recovery bundle ({type(error).__name__}).\n")


if __name__ == "__main__":
    main()
