import os
import shutil
import tempfile
import git
from pathlib import Path

def clone_repo(repo_url: str) -> str:
    """
    Clones a git repository to a temporary directory.
    Returns the path to the temporary directory.
    """
    temp_dir = tempfile.mkdtemp(prefix="repo_")
    try:
        git.Repo.clone_from(repo_url, temp_dir)
        return temp_dir
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise e

def cleanup_repo(repo_path: str):
    """
    Removes the temporary repository directory.
    """
    if repo_path and os.path.exists(repo_path):
        # Handle Windows permission errors on readonly .git files
        def remove_readonly(func, path, _):
            os.chmod(path, 0o777)
            func(path)
        shutil.rmtree(repo_path, onerror=remove_readonly)
