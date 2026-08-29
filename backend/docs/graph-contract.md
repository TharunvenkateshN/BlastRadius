# Graph Contract

The `/api/graph` endpoint returns a JSON object representing the dependency and call graph of a Python repository.

## Response Shape

```json
{
  "nodes": [
    {
      "id": "file.py:function_name",
      "name": "function_name",
      "file": "path/to/file.py",
      "type": "function|method|class|module"
    }
  ],
  "edges": [
    {
      "from": "file.py:function_name",
      "to": "other_file.py:called_function",
      "type": "call|import"
    }
  ]
}
```
